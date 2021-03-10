import { BigNumber } from 'ethers'

import { MAX_ITERATIONS, BIG_NUMBER_ZERO } from '../../../consts'
import { expect } from '../../../../setup'
import { handleEventsTransactionEnqueued } from '../../../../../src/services/l1-ingestion/handlers/transaction-enqueued'

describe('Event Handlers: OVM_CanonicalTransactionChain.TransactionEnqueued', () => {
  describe('getExtraData', () => {
    it('should return null', async () => {
      const output1 = await handleEventsTransactionEnqueued.getExtraData()

      const expected1 = null

      expect(output1).to.equal(expected1)
    })
  })

  describe('parseEvent', () => {
    // TODO: Honestly this is the simplest `parseEvent` function we have and there isn't much logic
    // to test. We could add a lot more tests that guarantee the correctness of the provided input,
    // but it's probably better to get wider test coverage first.

    it('should have a ctcIndex equal to null', () => {
      const input1: [any, any] = [
        {
          blockNumber: 0,
          args: {
            _queueIndex: BIG_NUMBER_ZERO,
            _gasLimit: BIG_NUMBER_ZERO,
            _timestamp: BIG_NUMBER_ZERO,
          },
        },
        null,
      ]

      const output1 = handleEventsTransactionEnqueued.parseEvent(
        ...input1
      )

      const expected1 = null

      expect(output1).to.have.property('ctcIndex', expected1)
    })

    it('should have a blockNumber equal to the integer value of the blockNumber parameter', () => {
      for (
        let i = 0;
        i < Number.MAX_SAFE_INTEGER;
        i += Math.floor(Number.MAX_SAFE_INTEGER / MAX_ITERATIONS)
      ) {
        const input1: [any, any] = [
          {
            blockNumber: i,
            args: {
              _queueIndex: BIG_NUMBER_ZERO,
              _gasLimit: BIG_NUMBER_ZERO,
              _timestamp: BIG_NUMBER_ZERO,
            },
          },
          null,
        ]

        const output1 = handleEventsTransactionEnqueued.parseEvent(
          ...input1
        )

        const expected1 = BigNumber.from(i).toNumber()

        expect(output1).to.have.property('blockNumber', expected1)
      }
    })

    it('should have an index equal to the integer value of the _queueIndex argument', () => {
      for (
        let i = 0;
        i < Number.MAX_SAFE_INTEGER;
        i += Math.floor(Number.MAX_SAFE_INTEGER / MAX_ITERATIONS)
      ) {
        const input1: [any, any] = [
          {
            blockNumber: 0,
            args: {
              _queueIndex: BigNumber.from(i),
              _gasLimit: BIG_NUMBER_ZERO,
              _timestamp: BIG_NUMBER_ZERO,
            },
          },
          null,
        ]

        const output1 = handleEventsTransactionEnqueued.parseEvent(
          ...input1
        )

        const expected1 = BigNumber.from(i).toNumber()

        expect(output1).to.have.property('index', expected1)
      }
    })

    it('should have a gasLimit equal to the integer value of the _gasLimit argument', () => {
      for (
        let i = 0;
        i < Number.MAX_SAFE_INTEGER;
        i += Math.floor(Number.MAX_SAFE_INTEGER / MAX_ITERATIONS)
      ) {
        const input1: [any, any] = [
          {
            blockNumber: 0,
            args: {
              _queueIndex: BIG_NUMBER_ZERO,
              _gasLimit: BigNumber.from(i),
              _timestamp: BIG_NUMBER_ZERO,
            },
          },
          null,
        ]

        const output1 = handleEventsTransactionEnqueued.parseEvent(
          ...input1
        )

        const expected1 = BigNumber.from(i).toNumber()

        expect(output1).to.have.property('gasLimit', expected1)
      }
    })

    it('should have a timestamp equal to the integer value of the _timestamp argument', () => {
      for (
        let i = 0;
        i < Number.MAX_SAFE_INTEGER;
        i += Math.floor(Number.MAX_SAFE_INTEGER / MAX_ITERATIONS)
      ) {
        const input1: [any, any] = [
          {
            blockNumber: 0,
            args: {
              _queueIndex: BIG_NUMBER_ZERO,
              _gasLimit: BIG_NUMBER_ZERO,
              _timestamp: BigNumber.from(i),
            },
          },
          null,
        ]

        const output1 = handleEventsTransactionEnqueued.parseEvent(
          ...input1
        )

        const expected1 = BigNumber.from(i).toNumber()

        expect(output1).to.have.property('timestamp', expected1)
      }
    })
  })

  describe.skip('storeEvent', () => {
    // TODO: I don't know the best way to test this, plus it's just a single line. Going to ignore
    // it for now.
  })
})
