export { type ActionType, type Receipt, type ReceiptAction, type Attestation, type HandoffBundle, type AgentKeyPair, type AnchorResult, type StorageResult } from './types';
export { hash, generateKeyPair, sign, verify, publicKeyToHex } from './crypto';
export { createReceipt, getSignaturePayload } from './receipt';
export { ReceiptChain } from './chain';
export { ReceiptAgent } from './agent';
export { verifyReceipt, verifyChain, type VerificationResult } from './verify';

export { anchorOnChain, type AnchorConfig } from './integrations/0g-chain';
export { storeChainOn0G, computeMerkleRoot } from './integrations/0g-storage';
export { inferWithAttestation, type ZGComputeConfig, type ZGInferenceResult } from './integrations/0g-compute';
export { createAxlClient, AxlTransport, type AxlConfig, type AxlPeerInfo, type AxlMessage, type AxlHandoffPayload } from './integrations/axl';
export {
  registerParentName,
  registerSubname,
  setTextRecords,
  resolveAgent,
  ENS_SEPOLIA,
  type EnsConfig,
  type AgentTextRecords,
  type EnsRegistrationResult,
  type ResolvedAgent,
} from './integrations/ens-identity';

export {
  listFineTuningProviders,
  listFineTuningModels,
  createFineTuningTask,
  getFineTuningTaskStatus,
  uploadDatasetToTEE,
  createFineTuningAttestation,
  type FineTuningConfig,
  type FineTuningTaskResult,
  type FineTuningProvider,
  type FineTuningModel,
} from './integrations/0g-fine-tuning';

export {
  receiptsToTrainingData,
  trainingDataToJsonl,
  chainToFineTuningDataset,
  type TrainingExample,
} from './integrations/training-data';
