import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { canonicalManifest, verifyToolManifest } = require('../../../dist-electron/electron/automation/manifest-verifier.cjs')

function signedTool() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicDer = publicKey.export({ format: 'der', type: 'spki' })
  const publicKeyB64 = publicDer.subarray(-32).toString('base64')
  const manifest = {
    schemaVersion: 1,
    toolId: 'tool_register',
    version: '1.2.0',
    scriptKey: 'amazon.register.v1',
    runnerApiVersion: 1,
    artifactSha256: 'embedded',
    artifactUrl: null,
  }
  const signature = crypto.sign(null, canonicalManifest(manifest), privateKey).toString('base64')
  return {
    publicKeyB64,
    tool: {
      id: 'tool_register',
      launchGrant: {
        scriptKey: 'amazon.register.v1',
        toolVersion: '1.2.0',
        runnerApiVersion: 1,
        signatureRequired: true,
        toolManifest: manifest,
        toolSignature: signature,
        signingKeyId: 'tool-signing-v1',
      },
    },
  }
}

describe('tool manifest verifier', () => {
  it('验证 Ed25519 签名和清单字段', () => {
    const { tool, publicKeyB64 } = signedTool()
    expect(verifyToolManifest(tool, publicKeyB64)).toMatchObject({ verified: true, legacy: false })
  })

  it('拒绝被篡改的脚本清单', () => {
    const { tool, publicKeyB64 } = signedTool()
    tool.launchGrant.toolManifest.artifactSha256 = 'tampered'
    expect(() => verifyToolManifest(tool, publicKeyB64)).toThrow('工具签名验证失败')
  })

  it('兼容尚未启用云端签名的旧控制面', () => {
    expect(verifyToolManifest({ id: 'legacy', launchGrant: {} }, '')).toEqual({ verified: false, legacy: true })
  })
})
