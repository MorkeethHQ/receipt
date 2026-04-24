import type { Attestation } from '../types';

export interface ZGComputeConfig {
  evmRpc: string;
  privateKey: string;
  providerAddress: string;
  serviceName?: string;
}

export interface ZGInferenceResult {
  response: string;
  attestation: Attestation | null;
}

export async function inferWithAttestation(
  prompt: string,
  config: ZGComputeConfig,
): Promise<ZGInferenceResult> {
  // @ts-ignore — optional peer dependency
  const brokerModule: any = await import('@0glabs/0g-serving-broker');
  // @ts-ignore — optional peer dependency
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.evmRpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const broker = await brokerModule.createZGComputeNetworkBroker(wallet);

  const services = await broker.getServiceMetadata();
  const service = config.serviceName
    ? services.find((s: any) => s.name === config.serviceName)
    : services[0];

  if (!service) throw new Error('No 0G Compute service available');

  const headers = await broker.getRequestHeaders(
    config.providerAddress,
    service.name,
    prompt,
  );

  const apiResponse = await fetch(`${service.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model: service.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!apiResponse.ok) throw new Error(`0G Compute API error: ${apiResponse.status}`);

  const result: any = await apiResponse.json();
  const responseText: string = result.choices?.[0]?.message?.content ?? '';

  let attestation: Attestation | null = null;
  try {
    const valid = await broker.processResponse(
      config.providerAddress,
      service.name,
      responseText,
      result.attestation,
    );
    if (valid) {
      attestation = {
        provider: '0g-compute',
        type: 'tee',
        evidence: JSON.stringify({ providerAddress: config.providerAddress, serviceName: service.name }),
        timestamp: Date.now(),
      };
    }
  } catch {
    // Attestation processing failed — response is still usable
  }

  return { response: responseText, attestation };
}
