import { expect } from '../../../setup'

/* Imports: External */
import { ethers } from 'hardhat'
import { Contract, Signer } from 'ethers'
import { getContractFactory } from '@eth-optimism/contracts'

/* Imports: Internal */
import { L1DataTransportService } from '../../../../src/services/main/service'
import { L1DataTransportClient } from '../../../../src/client/client'
import { sleep, encodeAppendSequencerBatch } from '@eth-optimism/core-utils'

describe('L1 Data Ingestion Service', () => {
  let signer: Signer
  before(async () => {
    ;[signer] = await ethers.getSigners()
  })

  let Lib_AddressManager: Contract
  let OVM_CanonicalTransactionChain: Contract
  let OVM_StateCommitmentChain: Contract
  let OVM_ExecutionManager: Contract
  beforeEach(async () => {
    Lib_AddressManager = await getContractFactory(
      'Lib_AddressManager',
      signer
    ).deploy()
    OVM_CanonicalTransactionChain = await getContractFactory(
      'OVM_CanonicalTransactionChain',
      signer
    ).deploy(
      Lib_AddressManager.address,
      600, // forceInclusionPeriodSeconds
      10, // forceInclusionPeriodBlocks
      100_000_000 // maxTransactionGasLimit
    )
    OVM_StateCommitmentChain = await getContractFactory(
      'OVM_StateCommitmentChain',
      signer
    ).deploy(
      Lib_AddressManager.address,
      600, // fraudProofWindow
      600 // sequencerPublishWindow
    )
    OVM_ExecutionManager = await getContractFactory(
      'OVM_ExecutionManager',
      signer
    ).deploy(
      Lib_AddressManager.address,
      {
        minTransactionGasLimit: 0,
        maxTransactionGasLimit: 100_000_000,
        maxGasPerQueuePerEpoch: 100_000_000,
        secondsPerEpoch: 0,
      },
      {
        ovmCHAINID: 69,
      }
    )

    const Factory__OVM_ChainStorageContainer = getContractFactory(
      'OVM_ChainStorageContainer',
      signer
    )
    const OVM_ChainStorageContainer_ctc_batches = await Factory__OVM_ChainStorageContainer.deploy(
      Lib_AddressManager.address,
      'OVM_CanonicalTransactionChain'
    )
    const OVM_ChainStorageContainer_ctc_queue = await Factory__OVM_ChainStorageContainer.deploy(
      Lib_AddressManager.address,
      'OVM_CanonicalTransactionChain'
    )
    const OVM_ChainStorageContainer_scc_batches = await Factory__OVM_ChainStorageContainer.deploy(
      Lib_AddressManager.address,
      'OVM_CanonicalTransactionChain'
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:batches',
      OVM_ChainStorageContainer_ctc_batches.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:queue',
      OVM_ChainStorageContainer_ctc_queue.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:SCC:batches',
      OVM_ChainStorageContainer_scc_batches.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_CanonicalTransactionChain',
      OVM_CanonicalTransactionChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_StateCommitmentChain',
      OVM_StateCommitmentChain.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ExecutionManager',
      OVM_ExecutionManager.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_Sequencer',
      await signer.getAddress()
    )
  })

  let service: L1DataTransportService
  let client: L1DataTransportClient
  beforeEach(async () => {
    service = new L1DataTransportService({
      addressManager: Lib_AddressManager.address,
      l1RpcProvider: ethers.provider,
      confirmations: 0,
      pollingInterval: 1, // 1ms. Probably fine for testing?
      dbPath: `./test/temp/db-${Date.now()}`,
    })

    service.start()
    await sleep(1000)
    client = new L1DataTransportClient('http://localhost:7878')
  })

  afterEach(async () => {
    await service.stop()
  })

  it('should be able to handle an upgrade of the CanonicalTransactionChain', async () => {
    const timestamp1 = Math.floor(Date.now() / 1000)
    const blockNumber1 = await ethers.provider.getBlockNumber()

    // Create a batch of 10 transactions to the first CTC.
    const batch1 = {
      shouldStartAtBatch: 0,
      totalElementsToAppend: 10,
      contexts: [
        {
          numSequencedTransactions: 10,
          numSubsequentQueueTransactions: 0,
          timestamp: timestamp1,
          blockNumber: blockNumber1,
        },
      ],
      transactions: [...Array(10)].map((_, i) => {
        return '0x' + '69'.repeat(i)
      }),
    }

    // Submit the batch.
    await signer.sendTransaction({
      to: OVM_CanonicalTransactionChain.address,
      data:
        ethers.utils.id('appendSequencerBatch()').slice(0, 10) +
        encodeAppendSequencerBatch(batch1),
    })

    // Create a new CTC.
    OVM_CanonicalTransactionChain = await getContractFactory(
      'OVM_CanonicalTransactionChain',
      signer
    ).deploy(
      Lib_AddressManager.address,
      600, // forceInclusionPeriodSeconds
      10, // forceInclusionPeriodBlocks
      100_000_000 // maxTransactionGasLimit
    )

    // Update the CTC address in the AddressManager.
    await Lib_AddressManager.setAddress(
      'OVM_CanonicalTransactionChain',
      OVM_CanonicalTransactionChain.address
    )

    const timestamp2 = Math.floor(Date.now() / 1000)
    const blockNumber2 = await ethers.provider.getBlockNumber()

    // Create a second batch.
    const batch2 = {
      shouldStartAtBatch: 10,
      totalElementsToAppend: 10,
      contexts: [
        {
          numSequencedTransactions: 10,
          numSubsequentQueueTransactions: 0,
          timestamp: timestamp2,
          blockNumber: blockNumber2,
        },
      ],
      transactions: [...Array(10)].map((_, i) => {
        return '0x' + '69'.repeat(i)
      }),
    }

    // Submit the second batch.
    await signer.sendTransaction({
      to: OVM_CanonicalTransactionChain.address,
      data:
        ethers.utils.id('appendSequencerBatch()').slice(0, 10) +
        encodeAppendSequencerBatch(batch2),
    })

    // We need a `sleep` here because there's a bit of processing time for each new thing that the
    // service receives from L1. So the service needs a few seconds after all the events are
    // emitted in order to sync to the tip. Using a `sleep` statement is the easiest way to account
    // for this.
    await sleep(1000)

    const latest = await client.getLatestTransaction()
    expect(latest.transaction.index).to.equal(19)
    expect(latest.batch.index).to.equal(1)
  })

  it('should handle a few quick of CTC address changes', async () => {
    // Submit 5 batches and switch CTC addresses after each batch.
    for (let i = 0; i < 5; i++) {
      const timestamp1 = Math.floor(Date.now() / 1000)
      const blockNumber1 = await ethers.provider.getBlockNumber()

      const batch1 = {
        shouldStartAtBatch: i * 10,
        totalElementsToAppend: 10,
        contexts: [
          {
            numSequencedTransactions: 10,
            numSubsequentQueueTransactions: 0,
            timestamp: timestamp1,
            blockNumber: blockNumber1,
          },
        ],
        transactions: [...Array(10)].map((_, i) => {
          return '0x' + '69'.repeat(i)
        }),
      }

      await signer.sendTransaction({
        to: OVM_CanonicalTransactionChain.address,
        data:
          ethers.utils.id('appendSequencerBatch()').slice(0, 10) +
          encodeAppendSequencerBatch(batch1),
      })

      OVM_CanonicalTransactionChain = await getContractFactory(
        'OVM_CanonicalTransactionChain',
        signer
      ).deploy(
        Lib_AddressManager.address,
        600, // forceInclusionPeriodSeconds
        10, // forceInclusionPeriodBlocks
        100_000_000 // maxTransactionGasLimit
      )

      await Lib_AddressManager.setAddress(
        'OVM_CanonicalTransactionChain',
        OVM_CanonicalTransactionChain.address
      )
    }

    // Wait a bit for the service to catch up. Same reason as above.
    await sleep(10000)

    const latest = await client.getLatestTransaction()
    expect(latest.transaction.index).to.equal(999)
    expect(latest.batch.index).to.equal(99)
  })
})
