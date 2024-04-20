import { InfuraNetworkType } from '@metamask/controller-utils';
import {
  MAINNET_RPC_URL,
  GOERLI_RPC_URL,
  SEPOLIA_RPC_URL,
  LINEA_GOERLI_RPC_URL,
  LINEA_SEPOLIA_RPC_URL,
  LINEA_MAINNET_RPC_URL,
} from '../../shared/constants/network';

const OVERRIDES = {
  mainnet: MAINNET_RPC_URL,
  goerli: GOERLI_RPC_URL,
  sepolia: SEPOLIA_RPC_URL,
  'linea-goerli': LINEA_GOERLI_RPC_URL,
  'linea-sepolia': LINEA_SEPOLIA_RPC_URL,
  'linea-mainnet': LINEA_MAINNET_RPC_URL,
} as const;

export function getRpcOverride(network: InfuraNetworkType): string {
  return OVERRIDES[network];
}