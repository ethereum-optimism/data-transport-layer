import { BigNumber, ethers } from 'ethers'
import { expect } from '../../../../setup'
import {
  SequencerBatchAppendedExtraData,
  validateBatchTransaction,
  handleEventsSequencerBatchAppended,
} from '../../../../../src/services/l1-ingestion/handlers/sequencer-batch-appended'
import { l1TransactionData } from '../../../examples/l1-data'
import { blocksOnL2 } from '../../../examples/l2-data'

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

  describe('handleEventsSequencerBatchAppended.parseEvent', () => {
    // This tests the behavior of parsing a real mainnet transaction,
    // so it will break if the encoding scheme changes.
    it('should correctly parse a mainnet transaction', async () => {
      const input1: [any, SequencerBatchAppendedExtraData] = [
        {
          args: {
            _startingQueueIndex: ethers.constants.Zero,
            _numQueueElements: ethers.constants.Zero,
            _totalElements: ethers.constants.Zero,
          },
        },
        {
          l1TransactionData,
          timestamp: 0,
          blockNumber: 0,
          submitter: '',
          l1TransactionHash: '',
          gasLimit: 0,
          prevTotalElements: ethers.constants.Zero,
          batchIndex: ethers.constants.Zero,
          batchSize: ethers.constants.Zero,
          batchRoot: '',
          batchExtraData: '',
        },
      ]

      const output1 = await handleEventsSequencerBatchAppended.parseEvent(
        ...input1
      )

      // Expected results based on mainnet data
      // Source: https://ethtx.info/mainnet/0x6effe006836b841205ace4d99d7ae1b74ee96aac499a3f358b97fccd32ee9af2
      const txEntries = output1.transactionEntries
      expect(txEntries).to.have.length(101)
      expect(txEntries.every((t) => t.queueOrigin === 'sequencer' || 'l1')).to
        .be.true

      // Sequencer transactions are decoded, but l1 transactions are not
      txEntries.forEach((tx, i) => {
        if (tx.queueOrigin === 'l1') {
          expect(tx.decoded).to.be.null
        } else {
          const l2Tx = blocksOnL2[i].transactions[0]
          expect(tx.decoded.data).to.equal(l2Tx.data)
          expect(tx.decoded.target).to.equal(l2Tx.to.toLowerCase())
          expect(tx.decoded.nonce).to.equal(l2Tx.nonce)
          expect(tx.decoded.gasLimit).to.equal(BigNumber.from(l2Tx.gasLimit.hex).toNumber())
          expect(tx.decoded.gasPrice).to.equal(BigNumber.from(l2Tx.gasPrice.hex).toNumber())
        }
      })
    })

    it('should error on malformed transaction data', async () => {
      const input1: [any, SequencerBatchAppendedExtraData] = [
        {
          args: {
            _startingQueueIndex: ethers.constants.Zero,
            _numQueueElements: ethers.constants.Zero,
            _totalElements: ethers.constants.Zero,
          },
        },
        {
          l1TransactionData: '0x00000',
          timestamp: 0,
          blockNumber: 0,
          submitter: '',
          l1TransactionHash: '',
          gasLimit: 0,
          prevTotalElements: ethers.constants.Zero,
          batchIndex: ethers.constants.Zero,
          batchSize: ethers.constants.Zero,
          batchRoot: '',
          batchExtraData: '',
        },
      ]

      expect(() => {
        handleEventsSequencerBatchAppended.parseEvent(...input1)
      }).to.throw(
        `Block ${input1[1].blockNumber} transaction data is invalid for decoding: ${input1[1].l1TransactionData} , ` +
          `converted buffer length is < 12.`
      )
    })
  })
})
