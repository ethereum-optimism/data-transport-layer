import { expect } from '../setup'

/* Imports: External */
import rimraf from 'rimraf'
import { getContractFactory } from '@eth-optimism/contracts'
import { Contract, Signer } from 'ethers'
import { ethers } from 'hardhat'

/* Imports: Internal */
import { L1DataTransportService } from '../../src/services/main/service'
import { L1DataTransportClient } from '../../src/client/client'
import { sleep } from '../../src/utils'

const DEFAULT_TEST_OPTIONS = {
  db: './db',
  port: 7878,
  confirmations: 0,
  l1RpcEndpoint: 'http://localhost:8545',
  pollingInterval: 10,
  logsPerPollingInterval: 2000,
}

// TODO: We'll likely have some code repetition here until we see the larger patterns. We'll
// eventually want some sort of framework for these tests.
describe('[L1 Data Transport Layer]: Basic Tests', () => {
  let signer: Signer
  before(async () => {
    ;[signer] = await ethers.getSigners()
  })

  let Lib_AddressManager: Contract
  let OVM_StateCommitmentChain: Contract
  let OVM_ExecutionManager: Contract
  let OVM_CanonicalTransactionChain: Contract
  beforeEach(async () => {
    Lib_AddressManager = await getContractFactory('Lib_AddressManager')
      .connect(signer)
      .deploy()

    const OVM_ChainStorageContainer__CTC_QUEUE = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_CanonicalTransactionChain')

    const OVM_ChainStorageContainer__CTC_BATCHES = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_CanonicalTransactionChain')

    const OVM_ChainStorageContainer__SCC_BATCHES = await getContractFactory(
      'OVM_ChainStorageContainer'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 'OVM_StateCommitmentChain')

    OVM_CanonicalTransactionChain = await getContractFactory(
      'OVM_CanonicalTransactionChain'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 1_000_000, 1_000_000, 8_000_000)

    OVM_StateCommitmentChain = await getContractFactory(
      'OVM_StateCommitmentChain'
    )
      .connect(signer)
      .deploy(Lib_AddressManager.address, 1_000_000, 1_000_000)

    OVM_ExecutionManager = await getContractFactory('OVM_ExecutionManager')
      .connect(signer)
      .deploy(
        Lib_AddressManager.address,
        {
          minTransactionGasLimit: 0,
          maxTransactionGasLimit: 8_000_000,
          maxGasPerQueuePerEpoch: 1_000_000_000,
          secondsPerEpoch: 0,
        },
        {
          ovmCHAINID: 420,
        }
      )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:queue',
      OVM_ChainStorageContainer__CTC_QUEUE.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:CTC:batches',
      OVM_ChainStorageContainer__CTC_BATCHES.address
    )

    await Lib_AddressManager.setAddress(
      'OVM_ChainStorageContainer:SCC:batches',
      OVM_ChainStorageContainer__SCC_BATCHES.address
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
  })

  let service: L1DataTransportService
  beforeEach(async () => {
    if (service) {
      await service.stop()
      await sleep(1000)
    }

    rimraf.sync(DEFAULT_TEST_OPTIONS.db)

    service = new L1DataTransportService({
      ...DEFAULT_TEST_OPTIONS,
      addressManager: Lib_AddressManager.address,
    })

    // TODO: We really need better feedback to figure out when the service is started.
    service.start()
    await sleep(1000)
  })

  let client: L1DataTransportClient
  beforeEach(async () => {
    client = new L1DataTransportClient(
      `http://localhost:${DEFAULT_TEST_OPTIONS.port}`
    )
  })

  describe('Handling TransactionEnqueued events', () => {
    it('should be able to handle a single event', async () => {
      const target = '0x' + '11'.repeat(20)
      const gasLimit = 5_000_000
      const data = '0x' + '12'.repeat(420)
      const response = await OVM_CanonicalTransactionChain.connect(
        signer
      ).enqueue(target, gasLimit, data)

      const receipt = await response.wait()
      const block = await ethers.provider.getBlock(receipt.blockNumber)

      await sleep(1000)
      const enqueue = await client.getEnqueueByIndex(0)

      expect(enqueue).to.deep.equal({
        index: 0,
        target: target,
        data: data,
        gasLimit: gasLimit,
        origin: await signer.getAddress(),
        blockNumber: block.number,
        timestamp: block.timestamp,
      })
    })

    // it('should be able to handle multiple events in the same block', async () => {})

    // it('should be able to handle multiple events in different blocks', async () => {})

    // it('should be able to handle events from multiple different addresses', async () => {})
  })
})