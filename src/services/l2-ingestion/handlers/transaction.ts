/* Imports: External */
import { ctcCoder, ZERO_ADDRESS } from '@eth-optimism/core-utils'
import { BigNumber, ethers } from 'ethers'

/* Imports: Internal */
import { TransportDB } from '../../../db/transport-db'
import {
  DecodedSequencerBatchTransaction,
  StateRootEntry,
  TransactionEntry,
} from '../../../types'
import {
  padHexString,
  SEQUENCER_ENTRYPOINT_ADDRESS,
  SEQUENCER_GAS_LIMIT,
} from '../../../utils'

export const handleSequencerBlock = {
  parseBlock: async (
    block: any,
    chainId: number
  ): Promise<{
    transactionEntry: TransactionEntry
    stateRootEntry: StateRootEntry
  }> => {
    const transaction = block.transactions[0]

    let transactionEntry: Partial<TransactionEntry> = {
      index: BigNumber.from(transaction.index).toNumber(),
      batchIndex: null,
      blockNumber: BigNumber.from(transaction.l1BlockNumber).toNumber(),
      timestamp: BigNumber.from(transaction.l1Timestamp).toNumber(),
      queueOrigin: transaction.queueOrigin,
      queueIndex:
        transaction.queueIndex === null
          ? null
          : BigNumber.from(transaction.queueIndex).toNumber(),
      confirmed: false,
    }

    if (transaction.queueOrigin === 'sequencer') {
      const decodedTransaction: DecodedSequencerBatchTransaction = {
        sig: {
          v: BigNumber.from(transaction.v).toNumber() - 2 * chainId - 35,
          r: padHexString(transaction.r, 32),
          s: padHexString(transaction.s, 32),
        },
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        gasPrice: BigNumber.from(transaction.gasPrice).toNumber(), // ?
        nonce: BigNumber.from(transaction.nonce).toNumber(),
        target: transaction.to || ZERO_ADDRESS, // ?
        data: transaction.input,
      }

      transactionEntry = {
        ...transactionEntry,
        gasLimit: SEQUENCER_GAS_LIMIT, // ?
        target: SEQUENCER_ENTRYPOINT_ADDRESS,
        origin: null,
        // TODO: Remove this when we change geth.
        data: maybeEncodeSequencerBatchTransaction(
          decodedTransaction,
          transaction.txType
        ),
      }
    } else {
      transactionEntry = {
        ...transactionEntry,
        gasLimit: BigNumber.from(transaction.gas).toNumber(),
        target: ethers.utils.getAddress(transaction.to),
        origin: ethers.utils.getAddress(transaction.l1TxOrigin),
        data: transaction.input,
      }
    }

    const stateRootEntry: StateRootEntry = {
      index: BigNumber.from(transaction.index).toNumber(),
      batchIndex: null,
      value: block.stateRoot,
      confirmed: false,
    }

    return {
      transactionEntry: transactionEntry as TransactionEntry, // Not the cleanest thing in the world. Could be improved.
      stateRootEntry,
    }
  },
  storeBlock: async (
    entry: {
      transactionEntry: TransactionEntry
      stateRootEntry: StateRootEntry
    },
    db: TransportDB
  ): Promise<void> => {
    // Having separate indices for confirmed/unconfirmed means we never have to worry about
    // accidentally overwriting a confirmed transaction with an unconfirmed one. Unconfirmed
    // transactions are purely extra information.
    await db.putUnconfirmedTransactionEntries([entry.transactionEntry])
    await db.putUnconfirmedStateRootEntries([entry.stateRootEntry])
  },
}

/**
 * Attempts to encode a sequencer batch transaction.
 * @param transaction Transaction to encode.
 * @param type Transaction type.
 */
const maybeEncodeSequencerBatchTransaction = (
  transaction: DecodedSequencerBatchTransaction,
  type: 'EIP155' | 'EthSign' | null
): string => {
  if (type === 'EIP155') {
    return ctcCoder.eip155TxData.encode(transaction).toLowerCase()
  } else if (type === 'EthSign') {
    return ctcCoder.ethSignTxData.encode(transaction).toLowerCase()
  } else {
    // Throw?
    return
  }
}

/**
 * Handles differences between the sequencer's enum strings and our own.
 * Will probably want to move this into core-utils eventually.
 * @param type Sequencer transaction type to parse.
 */
const parseTxType = (
  type: 'EIP155' | 'EthSign' | null
): 'EIP155' | 'ETH_SIGN' | null => {
  if (type === 'EthSign') {
    return 'ETH_SIGN'
  } else {
    return type
  }
}
