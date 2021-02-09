/* Imports: External */
import { getContractFactory } from '@eth-optimism/contracts'

/* Imports: Internal */
import {
  EventStateBatchAppended,
  StateRootBatchEntry,
  StateRootEntry,
  EventHandlerSet,
} from '../../../types'

export const handleEventsStateBatchAppended: EventHandlerSet<
  EventStateBatchAppended,
  {
    timestamp: number
    blockNumber: number
    submitter: string
    l1TransactionHash: string
    l1TransactionData: string
  },
  {
    stateRootBatchEntry: StateRootBatchEntry
    stateRootEntries: StateRootEntry[]
  }
> = {
  fixEventsHandler: async (events) => {
    const fixedEvents = []
    for (const event of events) {
      const eventBlock = await event.getBlock()
      const l1Transaction = await event.getTransaction()

      fixedEvents.push({
        event,
        extraData: {
          timestamp: eventBlock.timestamp,
          blockNumber: eventBlock.number,
          submitter: l1Transaction.from,
          l1TransactionHash: l1Transaction.hash,
          l1TransactionData: l1Transaction.data,
        },
      })
    }

    return fixedEvents
  },
  parseEventsHandler: async (fixedEvents) => {
    const parsedEvents = []
    for (const fixedEvent of fixedEvents) {
      const stateRoots = getContractFactory(
        'OVM_StateCommitmentChain'
      ).interface.decodeFunctionData(
        'appendStateBatch',
        fixedEvent.extraData.l1TransactionData
      )[0]

      const stateRootEntries: StateRootEntry[] = []
      for (let i = 0; i < stateRoots.length; i++) {
        stateRootEntries.push({
          index: fixedEvent.event.args._prevTotalElements.toNumber() + i,
          batchIndex: fixedEvent.event.args._batchIndex.toNumber(),
          value: stateRoots[i],
        })
      }

      const stateRootBatchEntry = {
        index: fixedEvent.event.args._batchIndex.toNumber(),
        blockNumber: fixedEvent.extraData.blockNumber,
        timestamp: fixedEvent.extraData.timestamp,
        submitter: fixedEvent.extraData.submitter,
        size: fixedEvent.event.args._batchSize.toNumber(),
        root: fixedEvent.event.args._batchRoot,
        prevTotalElements: fixedEvent.event.args._prevTotalElements.toNumber(),
        extraData: fixedEvent.event.args._extraData,
        l1TransactionHash: fixedEvent.extraData.l1TransactionHash,
      }

      parsedEvents.push({
        stateRootBatchEntry,
        stateRootEntries,
      })
    }

    return parsedEvents
  },
  storeEventsHandler: async (entries, db) => {
    for (const entry of entries) {
      await db.putStateRootBatchEntries([entry.stateRootBatchEntry])
      await db.putStateRootEntries(entry.stateRootEntries)
    }
  },
}