/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import { JsonRpcProvider } from '@ethersproject/providers'
import colors from 'colors/safe'
import { LevelUp } from 'levelup'

/* Imports: Internal */
import { TransportDB } from '../../db/transport-db'
import { sleep, toRpcHexString, validators } from '../../utils'
import { L1DataTransportServiceOptions } from '../main/service'
import { handleSequencerBlock } from './handlers/transaction'

export interface L2IngestionServiceOptions
  extends L1DataTransportServiceOptions {
  db: LevelUp
}

export class L2IngestionService extends BaseService<L2IngestionServiceOptions> {
  protected name = 'L2 Ingestion Service'

  protected optionSettings = {
    db: {
      validate: validators.isLevelUP,
    },
    l2RpcProvider: {
      validate: (val: any) => {
        return validators.isUrl(val) || validators.isJsonRpcProvider(val)
      },
    },
    l2ChainId: {
      validate: validators.isInteger,
    },
    pollingInterval: {
      default: 5000,
      validate: validators.isInteger,
    },
    transactionsPerPollingInterval: {
      default: 1000,
      validate: validators.isInteger,
    },
    dangerouslyCatchAllErrors: {
      default: false,
      validate: validators.isBoolean,
    },
  }

  private state: {
    db: TransportDB
    l2RpcProvider: JsonRpcProvider
    highestSyncedL2BlockNumber: number
  } = {} as any

  protected async _init(): Promise<void> {
    this.state.db = new TransportDB(this.options.db)

    this.state.l2RpcProvider =
      typeof this.options.l2RpcProvider === 'string'
        ? new JsonRpcProvider(this.options.l2RpcProvider)
        : this.options.l2RpcProvider

    // No need for writing anything to the database, latest transaction is a good guess of where
    // to start. We won't overwrite any confirmed transactions, so this doesn't have to be exact.
    const latestTransaction = await this.state.db.getLatestTransaction()
    if (latestTransaction) {
      this.state.highestSyncedL2BlockNumber = Math.max(
        latestTransaction.index,
        1
      )
      this.logger.info(
        `Starting sync to sequencer blocks from height: ${this.state.highestSyncedL2BlockNumber}`
      )
    } else {
      this.state.highestSyncedL2BlockNumber = 1
    }
  }

  protected async _start(): Promise<void> {
    while (this.running) {
      try {
        const currentL2Block = await this.state.l2RpcProvider.getBlockNumber()
        const targetL2Block = Math.min(
          this.state.highestSyncedL2BlockNumber +
            this.options.transactionsPerPollingInterval,
          currentL2Block
        )

        // We're already at the head, so no point in attempting to sync.
        if (this.state.highestSyncedL2BlockNumber === targetL2Block) {
          await sleep(this.options.pollingInterval)
          continue
        }

        this.logger.info(
          `Synchronizing unconfirmed transactions from Layer 2 (Optimistic Ethereum) from block ${colors.yellow(
            `${this.state.highestSyncedL2BlockNumber}`
          )} to block ${colors.yellow(`${targetL2Block}`)}`
        )

        // Synchronize by requesting blocks from the sequencer. Sync from L1 takes precedence.
        await this._syncSequencerBlocks(
          this.state.highestSyncedL2BlockNumber,
          targetL2Block
        )

        this.state.highestSyncedL2BlockNumber = targetL2Block

        if (
          currentL2Block - this.state.highestSyncedL2BlockNumber <
          this.options.transactionsPerPollingInterval
        ) {
          await sleep(this.options.pollingInterval)
        }
      } catch (err) {
        if (!this.running || this.options.dangerouslyCatchAllErrors) {
          this.logger.error(`Caught an unhandled error: ${err}`)
          await sleep(this.options.pollingInterval)
        } else {
          // TODO: Is this the best thing to do here?
          throw err
        }
      }
    }
  }

  /**
   * Synchronizes unconfirmed transactions from a range of sequencer blocks.
   * @param startBlockNumber Block to start querying from.
   * @param endBlockNumber Block to query to.
   */
  private async _syncSequencerBlocks(
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<void> {
    const blocks = await this.state.l2RpcProvider.send('eth_getBlockRange', [
      toRpcHexString(startBlockNumber),
      toRpcHexString(endBlockNumber),
      true,
    ])

    for (const block of blocks) {
      const entry = await handleSequencerBlock.parseBlock(
        block,
        this.options.l2ChainId
      )
      await handleSequencerBlock.storeBlock(entry, this.state.db)
    }
  }
}
