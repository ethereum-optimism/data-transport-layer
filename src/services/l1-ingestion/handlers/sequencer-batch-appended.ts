/* Imports: External */
import { BigNumber, ethers } from 'ethers'
import { getContractFactory } from '@eth-optimism/contracts'
import {
  ctcCoder,
  fromHexString,
  toHexString,
  TxType,
  ZERO_ADDRESS,
  decodeAppendSequencerBatch,
} from '@eth-optimism/core-utils'

/* Imports: Internal */
import {
  DecodedSequencerBatchTransaction,
  EventArgsSequencerBatchAppended,
  TransactionBatchEntry,
  TransactionEntry,
  EventHandlerSet,
} from '../../../types'
import {
  SEQUENCER_ENTRYPOINT_ADDRESS,
  SEQUENCER_GAS_LIMIT,
} from '../../../utils'

export const handleEventsSequencerBatchAppended: EventHandlerSet<
  EventArgsSequencerBatchAppended,
  {
    timestamp: number
    blockNumber: number
    submitter: string
    l1TransactionData: string
    l1TransactionHash: string
    gasLimit: number

    // Stuff from TransactionBatchAppended.
    prevTotalElements: BigNumber
    batchIndex: BigNumber
    batchSize: BigNumber
    batchRoot: string
    batchExtraData: string
  },
  {
    transactionBatchEntry: TransactionBatchEntry
    transactionEntries: TransactionEntry[]
  }
> = {
  getExtraData: async (event, l1RpcProvider) => {
    const l1Transaction = await event.getTransaction()
    const eventBlock = await event.getBlock()

    // TODO: We need to update our events so that we actually have enough information to parse this
    // batch without having to pull out this extra event. For the meantime, we need to find this
    // "TransactonBatchAppended" event to get the rest of the data.
    const OVM_CanonicalTransactionChain = getContractFactory(
      'OVM_CanonicalTransactionChain'
    )
      .attach(event.address)
      .connect(l1RpcProvider)

    const batchSubmissionEvent = (
      await OVM_CanonicalTransactionChain.queryFilter(
        OVM_CanonicalTransactionChain.filters.TransactionBatchAppended(),
        eventBlock.number,
        eventBlock.number
      )
    ).find((foundEvent: ethers.Event) => {
      // We might have more than one event in this block, so we specifically want to find a
      // "TransactonBatchAppended" event emitted immediately before the event in question.
      return (
        foundEvent.transactionHash === event.transactionHash &&
        foundEvent.logIndex === event.logIndex - 1
      )
    })

    if (!batchSubmissionEvent) {
      throw new Error(
        `Well, this really shouldn't happen. A SequencerBatchAppended event doesn't have a corresponding TransactionBatchAppended event.`
      )
    }

    return {
      timestamp: eventBlock.timestamp,
      blockNumber: eventBlock.number,
      submitter: l1Transaction.from,
      l1TransactionHash: l1Transaction.hash,
      l1TransactionData: l1Transaction.data,
      gasLimit: SEQUENCER_GAS_LIMIT,

      prevTotalElements: batchSubmissionEvent.args._prevTotalElements,
      batchIndex: batchSubmissionEvent.args._batchIndex,
      batchSize: batchSubmissionEvent.args._batchSize,
      batchRoot: batchSubmissionEvent.args._batchRoot,
      batchExtraData: batchSubmissionEvent.args._extraData,
    }
  },
  parseEvent: (event, extraData) => {
    // Follows the spec at:
    // https://github.com/ethereum-optimism/specs/blob/main/l2-geth/l1-data-indexer.md

    const params = decodeAppendSequencerBatch(extraData.l1TransactionData)

    let sequencerTransactionCount = 0
    let queueTransactionCount = 0
    const transactionEntries: TransactionEntry[] = []
    for (const context of params.contexts) {
      for (let i = 0; i < context.numSequencedTransactions; i++) {
        const sequencerTransaction =
          params.transactions[sequencerTransactionCount]

        const { decoded, type } = maybeDecodeSequencerBatchTransaction(
          fromHexString(sequencerTransaction)
        )

        transactionEntries.push({
          index: extraData.prevTotalElements
            .add(
              BigNumber.from(sequencerTransactionCount + queueTransactionCount)
            )
            .toNumber(),
          batchIndex: extraData.batchIndex.toNumber(),
          blockNumber: BigNumber.from(context.blockNumber).toNumber(),
          timestamp: BigNumber.from(context.timestamp).toNumber(),
          gasLimit: BigNumber.from(extraData.gasLimit).toNumber(),
          target: SEQUENCER_ENTRYPOINT_ADDRESS,
          origin: null,
          data: toHexString(sequencerTransaction),
          queueOrigin: 'sequencer',
          type,
          queueIndex: null,
          decoded,
          confirmed: true,
        })

        sequencerTransactionCount += 1
      }

      for (let i = 0; i < context.numSubsequentQueueTransactions; i++) {
        const queueIndex = event.args._startingQueueIndex.add(
          BigNumber.from(queueTransactionCount)
        )

        // Okay, so. Since events are processed in parallel, we don't know if the Enqueue
        // event associated with this queue element has already been processed. So we'll ask
        // the api to fetch that data for itself later on and we use fake values for some
        // fields. The real TODO here is to make sure we fix this data structure to avoid ugly
        // "dummy" fields.
        transactionEntries.push({
          index: extraData.prevTotalElements
            .add(
              BigNumber.from(sequencerTransactionCount + queueTransactionCount)
            )
            .toNumber(),
          batchIndex: extraData.batchIndex.toNumber(),
          blockNumber: BigNumber.from(0).toNumber(),
          timestamp: BigNumber.from(0).toNumber(),
          gasLimit: BigNumber.from(0).toNumber(),
          target: ZERO_ADDRESS,
          origin: ZERO_ADDRESS,
          data: '0x',
          queueOrigin: 'l1',
          type: 'EIP155',
          queueIndex: queueIndex.toNumber(),
          decoded: null,
          confirmed: true,
        })

        queueTransactionCount += 1
      }
    }

    const transactionBatchEntry: TransactionBatchEntry = {
      index: extraData.batchIndex.toNumber(),
      root: extraData.batchRoot,
      size: extraData.batchSize.toNumber(),
      prevTotalElements: extraData.prevTotalElements.toNumber(),
      extraData: extraData.batchExtraData,
      blockNumber: BigNumber.from(extraData.blockNumber).toNumber(),
      timestamp: BigNumber.from(extraData.timestamp).toNumber(),
      submitter: extraData.submitter,
      l1TransactionHash: extraData.l1TransactionHash,
    }

    return {
      transactionBatchEntry,
      transactionEntries,
    }
  },
  storeEvent: async (entry, db) => {
    await db.putTransactionBatchEntries([entry.transactionBatchEntry])
    await db.putTransactionEntries(entry.transactionEntries)

    // Add an additional field to the enqueued transactions in the database
    // if they have already been confirmed
    for (const transactionEntry of entry.transactionEntries) {
      if (transactionEntry.queueOrigin === 'l1') {
        await db.putTransactionIndexByQueueIndex(
          transactionEntry.queueIndex,
          transactionEntry.index
        )
      }
    }
  },
}

const maybeDecodeSequencerBatchTransaction = (
  transaction: Buffer
): {
  decoded: DecodedSequencerBatchTransaction | null
  type: 'EIP155' | 'ETH_SIGN' | null
} => {
  let decoded = null
  let type = null

  try {
    const txType = transaction.slice(0, 1).readUInt8()
    if (txType === TxType.EIP155) {
      type = 'EIP155'
      decoded = ctcCoder.eip155TxData.decode(transaction.toString('hex'))
    } else if (txType === TxType.EthSign) {
      type = 'ETH_SIGN'
      decoded = ctcCoder.ethSignTxData.decode(transaction.toString('hex'))
    } else {
      throw new Error(`Unknown sequencer transaction type.`)
    }
    // Validate the transaction
    if (!validateBatchTransaction(type, decoded)) {
      decoded = null
    }
  } catch (err) {
    // Do nothing
  }

  return {
    decoded,
    type,
  }
}

export function validateBatchTransaction(
  type: string | null,
  decoded: DecodedSequencerBatchTransaction | null
): boolean {
  // Unknown types are considered invalid
  if (type === null) {
    return false
  }
  if (type === 'EIP155' || type === 'ETH_SIGN') {
    if (decoded.sig.v !== 1 && decoded.sig.v !== 0) {
      return false
    }
    return true
  }
  // Allow soft forks
  return false
}
