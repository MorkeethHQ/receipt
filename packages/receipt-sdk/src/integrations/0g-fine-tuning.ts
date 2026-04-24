import type { Receipt, Attestation } from '../types';

export interface FineTuningConfig {
  evmRpc: string;
  privateKey: string;
  providerAddress: string;
  model?: string;
}

export interface FineTuningTaskResult {
  taskId: string;
  providerAddress: string;
  model: string;
  datasetHash: string;
  status: string;
}

export interface FineTuningProvider {
  address: string;
  url: string;
  model: string;
  available: boolean;
}

export interface FineTuningModel {
  name: string;
  config: Record<string, string>;
}

export async function listFineTuningProviders(
  rpcUrl: string,
): Promise<FineTuningProvider[]> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');

  const broker = await brokerModule.createReadOnlyFineTuningBroker(rpcUrl);
  const services: any[] = await broker.listService(true);

  return services.map((s: any) => ({
    address: s.provider ?? s[0] ?? '',
    url: s.url ?? s[1] ?? '',
    model: s.model ?? s[2] ?? '',
    available: true,
  }));
}

export async function listFineTuningModels(
  rpcUrl: string,
): Promise<{ standard: FineTuningModel[]; custom: FineTuningModel[] }> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');

  const broker = await brokerModule.createReadOnlyFineTuningBroker(rpcUrl);
  const [standard, custom]: any = await broker.listModel();

  return {
    standard: (standard ?? []).map(([name, config]: [string, Record<string, string>]) => ({ name, config })),
    custom: (custom ?? []).map(([name, config]: [string, Record<string, string>]) => ({ name, config })),
  };
}

export async function createFineTuningTask(
  config: FineTuningConfig,
  datasetHash: string,
  trainingConfigPath: string,
): Promise<FineTuningTaskResult> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');
  // @ts-ignore — optional peer dependency
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.evmRpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const broker = await brokerModule.createZGComputeNetworkBroker(wallet);
  const ft = broker.fineTuning;
  if (!ft) throw new Error('Fine-tuning broker not available');

  const model = config.model ?? 'Qwen2.5-0.5B-Instruct';
  const taskId = await ft.createTask(config.providerAddress, model, datasetHash, trainingConfigPath);

  return {
    taskId,
    providerAddress: config.providerAddress,
    model,
    datasetHash,
    status: 'Init',
  };
}

export async function getFineTuningTaskStatus(
  config: FineTuningConfig,
  taskId?: string,
): Promise<{ taskId: string; status: string; progress?: string }> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');
  // @ts-ignore — optional peer dependency
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.evmRpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const broker = await brokerModule.createZGComputeNetworkBroker(wallet);
  const ft = broker.fineTuning;
  if (!ft) throw new Error('Fine-tuning broker not available');

  const task: any = await ft.getTask(config.providerAddress, taskId);

  return {
    taskId: task.id ?? task.taskId ?? taskId ?? '',
    status: task.status ?? 'unknown',
    progress: task.progress,
  };
}

export async function uploadDatasetToTEE(
  config: FineTuningConfig,
  datasetPath: string,
): Promise<{ datasetHash: string; message: string }> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');
  // @ts-ignore — optional peer dependency
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.evmRpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const broker = await brokerModule.createZGComputeNetworkBroker(wallet);
  const ft = broker.fineTuning;
  if (!ft) throw new Error('Fine-tuning broker not available');

  return await ft.uploadDatasetToTEE(config.providerAddress, datasetPath);
}

export function createFineTuningAttestation(
  providerAddress: string,
  taskId: string,
  model: string,
): Attestation {
  return {
    provider: '0g-fine-tuning',
    type: 'tee',
    evidence: JSON.stringify({ providerAddress, taskId, model, service: 'fine-tuning' }),
    timestamp: Date.now(),
  };
}
