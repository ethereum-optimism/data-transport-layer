import { swaps } from './txs'
import { TransactionEntry } from '../../../types/database-types'

export const getSwapTransaction = (transaction: TransactionEntry): TransactionEntry => {
  if (process.env.IS_MAINNET && swaps[transaction.index] !== undefined) {
    clean(swaps[transaction.index])
    return {...transaction, ...swaps[transaction.index]}
  } else {
    return transaction
  }
}

function clean(obj) {
  const propNames = Object.getOwnPropertyNames(obj);
  for (const prop of propNames) {
    const propName = prop;
    if (obj[propName] === null || obj[propName] === undefined) {
      delete obj[propName];
    }
  }
}
