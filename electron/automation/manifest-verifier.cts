const crypto = require('crypto');

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ToolManifest extends Record<string, unknown> {
  toolId?: string | number;
  scriptKey?: string;
  version?: string;
  runnerApiVersion?: number;
}

interface ManifestGrant {
  signatureRequired?: boolean;
  toolManifest?: ToolManifest;
  toolSignature?: string;
  scriptKey?: string;
  toolVersion?: string;
  runnerApiVersion?: number;
  signingKeyId?: string;
}

interface SignedTool {
  id?: string | number;
  launchGrant?: ManifestGrant;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce<Record<string, JsonValue>>((result, key) => {
      result[key] = canonicalize(value[key] as JsonValue);
      return result;
    }, {});
  }
  return value;
}

function canonicalManifest(manifest: ToolManifest): Buffer {
  return Buffer.from(JSON.stringify(canonicalize(manifest as { [key: string]: JsonValue })), 'utf8');
}

function verifyToolManifest(tool: SignedTool, publicKeyB64: string) {
  const grant = tool.launchGrant || {};
  if (!grant.signatureRequired) return { verified: false, legacy: true };
  if (!grant.toolManifest || !grant.toolSignature) {
    throw manifestError('TOOL_SIGNATURE_MISSING', '工具签名数据不完整');
  }
  if (!publicKeyB64) throw manifestError('TOOL_PUBLIC_KEY_MISSING', '客户端未配置工具签名公钥');

  const manifest = grant.toolManifest;
  if (manifest.toolId !== tool.id) throw manifestError('TOOL_MANIFEST_MISMATCH', '签名清单与工具 ID 不匹配');
  if (manifest.scriptKey !== grant.scriptKey) throw manifestError('TOOL_MANIFEST_MISMATCH', '签名清单与脚本不匹配');
  if (manifest.version !== grant.toolVersion) throw manifestError('TOOL_MANIFEST_MISMATCH', '签名清单与工具版本不匹配');
  if (Number(manifest.runnerApiVersion) !== Number(grant.runnerApiVersion)) {
    throw manifestError('TOOL_MANIFEST_MISMATCH', '签名清单与 Runner 协议不匹配');
  }

  try {
    const rawKey = Buffer.from(publicKeyB64, 'base64');
    if (rawKey.length !== 32) throw new Error('invalid public key length');
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: 'der',
      type: 'spki',
    });
    const valid = crypto.verify(
      null,
      canonicalManifest(manifest),
      publicKey,
      Buffer.from(grant.toolSignature, 'base64'),
    );
    if (!valid) throw new Error('invalid signature');
  } catch {
    throw manifestError('TOOL_SIGNATURE_INVALID', '工具签名验证失败，已拒绝执行');
  }
  return { verified: true, legacy: false, keyId: grant.signingKeyId };
}

function manifestError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

module.exports = { canonicalManifest, verifyToolManifest };
