# @eth-optimism/transaction-indexer

## What is this?

`@eth-optimism/transaction-indexer` is a long-running software service (written in TypeScript) designed to reliably index Optimistic Ethereum transaction data from Layer 1 (Ethereum).
Specifically, this service indexes:

* Transactions that have been enqueued for submission to the CanonicalTransactionChain via [`enqueue`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L225-L231).
* Transactions that have been included in the CanonicalTransactionChain via [`appendQueueBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L302-L306) or [`appendSequencerBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_CanonicalTransactionChain.sol#L352-L354).
* State roots (transaction results) that have been published to the StateCommitmentChain via [`appendStateBatch`](https://github.com/ethereum-optimism/contracts-v2/blob/13b7deef60f773241723ea874fc6e81b4003b164/contracts/optimistic-ethereum/OVM/chain/OVM_StateCommitmentChain.sol#L127-L132).

## How does it work?

We run two sub-services, the [`L1IngestionService`](./src/services/l1-ingestion/service.ts) and the [`L1TransportServer`](./src/services/server/service.ts). The `L1IngestionService` is responsible for querying for the various events and transaction data necessary to accurately index information from our Layer 1 (Ethereum) smart contracts. The `L1TransportServer` simply provides an API for accessing this information.

## Getting started

### Building and usage

After cloning and switching to the repository, install dependencies:

```bash
$ yarn
```

Use the following commands to build, use, test, and lint:

```bash
$ yarn build
$ yarn start
$ yarn test
$ yarn lint
```

## Configuration

We're using `dotenv` for our configuration.
Copy `.env.example` into `.env`, feel free to modify it.
Here's the list of environment variables you can change:

| Variable                                                | Default   |  Description |
| ------------------------------------------------------- | --------- | ------------ |
| TRANSACTION_INDEXER__DB_PATH                           | ./db      | Path to the database for this service. |
| TRANSACTION_INDEXER__ADDRESS_MANAGER                   | -         | Address of the AddressManager contract on L1. See [regenesis](https://github.com/ethereum-optimism/regenesis) repo to find this address for mainnet or kovan. |
| TRANSACTION_INDEXER__POLLING_INTERVAL                  | 5000      | Period of time between execution loops. |
| TRANSACTION_INDEXER__DANGEROUSLY_CATCH_ALL_ERRORS      | false     | If true, will catch all errors without throwing. |
| TRANSACTION_INDEXER__CONFIRMATIONS                     | 12        | Number of confirmations to wait before accepting transactions as "canonical". |
| TRANSACTION_INDEXER__SERVER_HOSTNAME                   | localhost | Host to run the API on. |
| TRANSACTION_INDEXER__SERVER_PORT                       | 7878      | Port to run the API on. |
| TRANSACTION_INDEXER__SYNC_FROM_L1                      | true      | Whether or not to sync from L1. |
| TRANSACTION_INDEXER__L1_RPC_ENDPOINT                   | -         | RPC endpoint for an L1 node. |
| TRANSACTION_INDEXER__LOGS_PER_POLLING_INTERVAL         | 2000      | Logs to sync per polling interval. |
| TRANSACTION_INDEXER__SYNC_FROM_L2                      | false     | Whether or not to sync from L2. |
| TRANSACTION_INDEXER__L2_RPC_ENDPOINT                   | -         | RPC endpoint for an L2 node. |
| TRANSACTION_INDEXER__TRANSACTIONS_PER_POLLING_INTERVAL | 1000      | Number of L2 transactions to query per polling interval. |
| TRANSACTION_INDEXER__L2_CHAIN_ID                       | -         | L2 chain ID. |
| TRANSACTION_INDEXER__LEGACY_SEQUENCER_COMPATIBILITY    | false     | Whether or not to enable "legacy" sequencer sync (without the custom `eth_getBlockRange` endpoint) |

## HTTP API

This section describes the HTTP API for accessing indexed Layer 1 data.

### Latest Ethereum Block Context

#### Request

```
GET /eth/context/latest
```

#### Response

```ts
{
    "blockNumber": number,
    "timestamp": number
}
```

### Enqueue by Index

#### Request

```
GET /enqueue/index/{index: number}
```

#### Response

```ts
{
  "index": number,
  "target": string,
  "data": string,
  "gasLimit": number,
  "origin": string,
  "blockNumber": number,
  "timestamp": number
}
```

### Transaction by Index

#### Request

```
GET /transaction/index/{index: number}
```

#### Response

```ts
{
    "transaction": {
        "index": number,
        "batchIndex": number,
        "data": string,
        "blockNumber": number,
        "timestamp": number,
        "gasLimit": number,
        "target": string,
        "origin": string,
        "queueOrigin": string,
        "type": string | null,
        "decoded": {
            "sig": {
                "r": string,
                "s": string,
                "v": string
            },
            "gasLimit": number,
            "gasPrice": number,
            "nonce": number,
            "target": string,
            "data": string
        } | null,
        "queueIndex": number | null,
    },
    
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    }
}
```

### Transaction Batch by Index

#### Request

```
GET /batch/transaction/index/{index: number}
```

#### Response

```ts
{
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
    
    "transactions": [
      {
        "index": number,
        "batchIndex": number,
        "data": string,
        "blockNumber": number,
        "timestamp": number,
        "gasLimit": number,
        "target": string,
        "origin": string,
        "queueOrigin": string,
        "type": string | null,
        "decoded": {
            "sig": {
                "r": string,
                "s": string,
                "v": string
            },
            "gasLimit": number,
            "gasPrice": number,
            "nonce": number,
            "target": string,
            "data": string
        } | null,
        "queueIndex": number | null,
      }
    ]
}
```


### State Root by Index

#### Request

```
GET /stateroot/index/{index: number}
```

#### Response

```ts
{
    "stateRoot": {
        "index": number,
        "batchIndex": number,
        "value": string
    },

    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
}
```

### State Root Batch by Index

#### Request

```
GET /batch/stateroot/index/{index: number}
```

#### Response

```ts
{
    "batch": {
        "index": number,
        "blockNumber": number,
        "timestamp": number,
        "submitter": string,
        "size": number,
        "root": string,
        "prevTotalElements": number,
        "extraData": string
    },
    
    "stateRoots": [
        {
            "index": number,
            "batchIndex": number,
            "value": string
        }
    ]
}
```
