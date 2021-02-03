/* Imports: External */
import { BaseService } from '@eth-optimism/service-base'
import express from 'express'
import { BigNumber } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'

/* Imports: Internal */
import { TransportDB } from '../../db/db'
import { loadOptimismContracts, OptimismContracts } from '../../utils'

export interface L1TransportServerOptions {
  db: any
  port: number
  confirmations: number
  addressManager: string
  l1RpcEndpoint: string
}

export class L1TransportServer extends BaseService<L1TransportServerOptions> {
  protected name = 'L1 Transport Server'
  protected defaultOptions = {
    port: 7878,
  }

  private state: {
    app: express.Express
    server: any
    db: TransportDB
    l1RpcProvider: JsonRpcProvider
    contracts: OptimismContracts
    chainId: number
  } = {} as any

  protected async _init(): Promise<void> {
    if (!this.options.db.isOpen()) {
      await this.options.db.open()
    }

    this.state.db = new TransportDB(this.options.db)
    this.state.app = express()
    this.state.l1RpcProvider = new JsonRpcProvider(this.options.l1RpcEndpoint)
    this.state.contracts = await loadOptimismContracts(
      this.state.l1RpcProvider,
      this.options.addressManager
    )

    this.state.chainId = BigNumber.from(
      await this.state.contracts.OVM_ExecutionManager.ovmCHAINID()
    ).toNumber()

    this.logger.info(`L2 (Optimism) Chain ID is: ${this.state.chainId}`)

    this.state.app.get('/eth/context/latest', async (req, res) => {
      try {
        const blockNumber =
          (await this.state.l1RpcProvider.getBlockNumber()) -
          this.options.confirmations
        const block = await this.state.l1RpcProvider.getBlock(blockNumber)

        return res.json({
          blockNumber: block.number,
          timestamp: block.timestamp,
          chainId: this.state.chainId,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/eth/context/index/:block', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const currentBlockNumber =
          (await this.state.l1RpcProvider.getBlockNumber()) -
          this.options.confirmations

        if (index > currentBlockNumber) {
          return res.json({
            blockNumber: null,
            timestamp: null,
            chainId: this.state.chainId,
          })
        }

        const block = await this.state.l1RpcProvider.getBlock(index)

        return res.json({
          blockNumber: block.number,
          timestamp: block.timestamp,
          chainId: this.state.chainId,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/enqueue/latest', async (req, res) => {
      try {
        const enqueue = await this.state.db.getLatestEnqueue()
        if (enqueue === null) {
          return res.json(null)
        }

        res.json(enqueue)
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/enqueue/index/:index', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const enqueue = await this.state.db.getEnqueueByIndex(index)
        if (enqueue === null) {
          return res.json(null)
        }

        res.json(enqueue)
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/transaction/latest', async (req, res) => {
      try {
        const transaction = await this.state.db.getLatestFullTransaction()

        if (transaction === null) {
          return res.json({
            transaction: null,
            batch: null,
          })
        }

        const batch = await this.state.db.getTransactionBatchByIndex(
          transaction.batchIndex
        )

        res.json({
          transaction,
          batch,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString })
      }
    })

    this.state.app.get('/transaction/index/:index', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const transaction = await this.state.db.getFullTransactionByIndex(index)
        if (transaction === null) {
          return res.json({
            transaction: null,
            batch: null,
          })
        }

        const batch = await this.state.db.getTransactionBatchByIndex(
          transaction.batchIndex
        )

        res.json({
          transaction,
          batch,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/batch/transaction/latest', async (req, res) => {
      try {
        const batch = await this.state.db.getLatestTransactionBatch()
        if (batch === null) {
          return res.json({
            batch: null,
            transactions: [],
          })
        }

        const transactions = await this.state.db.getFullTransactionsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (transactions === null) {
          return res.json({
            batch: null,
            transactions: [],
          })
        }

        res.json({
          batch,
          transactions,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/batch/transaction/index/:index', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const batch = await this.state.db.getTransactionBatchByIndex(index)
        if (batch === null) {
          return res.json({
            batch: null,
            transactions: [],
          })
        }

        const transactions = await this.state.db.getFullTransactionsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        if (transactions === null) {
          return res.json({
            batch: null,
            transactions: [],
          })
        }

        res.json({
          batch,
          transactions,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/stateroot/latest', async (req, res) => {
      try {
        const stateRoot = await this.state.db.getLatestStateRoot()
        if (stateRoot === null) {
          return res.json({
            stateRoot: null,
            batch: null,
          })
        }

        const batch = await this.state.db.getStateRootBatchByIndex(
          stateRoot.batchIndex
        )

        res.json({
          stateRoot,
          batch,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/stateroot/index/:index', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const stateRoot = await this.state.db.getStateRootByIndex(index)
        if (stateRoot === null) {
          return res.json({
            stateRoot: null,
            batch: null,
          })
        }

        const batch = await this.state.db.getStateRootBatchByIndex(
          stateRoot.batchIndex
        )

        res.json({
          stateRoot,
          batch,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/batch/stateroot/latest', async (req, res) => {
      try {
        const batch = await this.state.db.getLatestStateRootBatch()
        if (batch === null) {
          res.json({
            batch: null,
            stateRoots: [],
          })
        }

        const stateRoots = await this.state.db.getStateRootsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        res.json({
          batch,
          stateRoots,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })

    this.state.app.get('/batch/stateroot/index/:index', async (req, res) => {
      const index = BigNumber.from(req.params.index).toNumber()
      try {
        const batch = await this.state.db.getStateRootBatchByIndex(index)
        if (batch === null) {
          res.json({
            batch: null,
            stateRoots: [],
          })
        }

        const stateRoots = await this.state.db.getStateRootsByIndexRange(
          BigNumber.from(batch.prevTotalElements).toNumber(),
          BigNumber.from(batch.prevTotalElements).toNumber() +
            BigNumber.from(batch.size).toNumber()
        )

        res.json({
          batch,
          stateRoots,
        })
      } catch (e) {
        res.status(400)
        res.json({ error: e.toString() })
      }
    })
  }

  protected async _start(): Promise<void> {
    this.state.server = this.state.app.listen(this.options.port)
  }

  protected async _stop(): Promise<void> {
    this.state.server.close()
  }
}
