import { BigNumber } from 'ethers'

import { expect } from '../../../../setup'
import {
  validateBatchTransaction,
  handleEventsSequencerBatchAppended,
} from '../../../../../src/services/l1-ingestion/handlers/sequencer-batch-appended'
import { l1TransactionData } from '../examples/l1-data'

describe('Event Handlers: OVM_CanonicalTransactionChain.SequencerBatchAppended', () => {
  describe('validateBatchTransaction', () => {
    it('should mark a transaction as invalid if the type is null', () => {
      const input1: [any, any] = [null, null]

      const output1 = validateBatchTransaction(...input1)

      const expected1 = false

      expect(output1).to.equal(expected1)
    })

    it('should mark a transaction as invalid if the type is not EIP155 or ETH_SIGN', () => {
      const input1: [any, any] = ['SOME_RANDOM_TYPE', null]

      const output1 = validateBatchTransaction(...input1)

      const expected1 = false

      expect(output1).to.equal(expected1)
    })

    describe('when the transaction type is EIP155 or ETH_SIGN', () => {
      it('should mark a transaction as valid if the `v` parameter is 0', () => {
        // CTC index 23159
        const input1: [any, any] = [
          'EIP155',
          {
            sig: {
              v: 0,
            },
          },
        ]

        const output1 = validateBatchTransaction(...input1)

        const expected1 = true

        expect(output1).to.equal(expected1)
      })

      it('should mark a transaction as valid if the `v` parameter is 1', () => {
        // CTC index 23159
        const input1: [any, any] = [
          'EIP155',
          {
            sig: {
              v: 1,
            },
          },
        ]

        const output1 = validateBatchTransaction(...input1)

        const expected1 = true

        expect(output1).to.equal(expected1)
      })

      it('should mark a transaction as invalid if the `v` parameter is greater than 1', () => {
        // CTC index 23159
        const input1: [any, any] = [
          'EIP155',
          {
            sig: {
              v: 2,
            },
          },
        ]

        const output1 = validateBatchTransaction(...input1)

        const expected1 = false

        expect(output1).to.equal(expected1)
      })
    })

    describe('regressions', () => {
      it('should catch the invalid transaction', () => {
        // CTC index 23159
        const input1: [any, any] = [
          'EIP155',
          {
            sig: {
              r:
                '0x0fbef2080fadc4198ee0d6027e2eb70799d3418574cc085c34a14dcefe14d5d3',
              s:
                '0x3bf394a7cb2aca6790e67382f782a406aefce7553212db52b54a4e087c2195ad',
              v: 56,
            },
            gasLimit: 8000000,
            gasPrice: 0,
            nonce: 0,
            target: '0x1111111111111111111111111111111111111111',
            data: '0x1234',
          },
        ]

        const output1 = validateBatchTransaction(...input1)

        const expected1 = false

        expect(output1).to.equal(expected1)
      })
    })
  })

  describe.only('handleEventsSequencerBatchAppended.parseEvent', () => {
    it('should correctly parse a mainnet transaction', async () => {
      const input1: [any, any] = [
        { args: { _startingQueueIndex: BigNumber.from('0') } },
        {
          l1TransactionData,
          gasLimit: '0',
          prevTotalElements: BigNumber.from('0'),
          batchIndex: BigNumber.from('0'),
          batchSize: BigNumber.from('0'),
          timestamp: BigNumber.from('0'),
          blockNumber: BigNumber.from('11969713'),
        },
      ]

      const output1 = await handleEventsSequencerBatchAppended.parseEvent(
        ...input1
      )

      expect(output1.transactionEntries).to.have.length(101)
    })
  })
})
