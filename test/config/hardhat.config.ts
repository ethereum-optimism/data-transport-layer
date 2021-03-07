import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'

const config: HardhatUserConfig = {
  // All paths relative to ** this file **.
  paths: {
    tests: '../../test',
    cache: '../temp/cache',
    artifacts: '../temp/artifacts',
  },
  mocha: {
    timeout: 1000000,
  },
}

export default config
