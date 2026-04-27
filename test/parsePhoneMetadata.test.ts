import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePhoneMetadata } from '../src/lib/parsePhoneMetadata.ts'

test('resolves the iPhone sample from identifier-only lookup', () => {
  const rawText = `
IMEI 355487738212604
Serial No. DX3H1GZHN73D
EID 89049032005008882600059863581841
`

  const result = parsePhoneMetadata(rawText, [
    { format: 'upc_a', rawValue: '194252099131' },
  ])

  assert.equal(result.metadata.brand, 'Apple')
  assert.equal(result.metadata.deviceName, 'iPhone 11')
  assert.equal(result.metadata.storage, '128GB')
  assert.equal(result.metadata.color, 'Black')
  assert.equal(result.metadata.skuCode, 'MHDH3QN/A')
  assert.equal(result.metadata.modelNumber, 'A2221')
  assert.equal(result.metadata.lookupProof?.source, 'exact_upc')
})

test('resolves the iPhone sample from barcode-only identifiers', () => {
  const result = parsePhoneMetadata('', [
    { format: 'code_128', rawValue: '355487738212604' },
    { format: 'code_128', rawValue: '89049032005008882600059863581841' },
    { format: 'upc_a', rawValue: '194252099131' },
    { format: 'code_128', rawValue: 'DX3H1GZHN73D' },
  ])

  assert.equal(result.metadata.brand, 'Apple')
  assert.equal(result.metadata.deviceName, 'iPhone 11')
  assert.equal(result.metadata.modelNumber, 'A2221')
  assert.equal(result.metadata.serialNumber, 'DX3H1GZHN73D')
  assert.deepEqual(result.metadata.imeis, ['355487738212604'])
  assert.deepEqual(result.metadata.eids, ['89049032005008882600059863581841'])
  assert.equal(result.metadata.upc, '194252099131')
  assert.equal(result.metadata.lookupProof?.source, 'exact_upc')
})

test('backfills known identifiers from an exact IMEI lookup', () => {
  const rawText = `
IMEI/MEID 355487738493683
(S) Serial No. DX3H1GZHN7
`

  const result = parsePhoneMetadata(rawText, [])

  assert.equal(result.metadata.lookupProof?.source, 'exact_imei')
  assert.equal(result.metadata.serialNumber, 'DX3H1GZHN73D')
  assert.deepEqual(result.metadata.imeis, ['355487738493683'])
  assert.deepEqual(result.metadata.eids, ['89049032005008882600059863581841'])
  assert.equal(result.metadata.upc, '194252099131')
})

test('resolves the Samsung sample from model-code identifiers', () => {
  const rawText = `
SAMSUNG : SM-R925F
IME: 351876764733760 B
0 89043081202200836223027016618642
MANUFACTURE DATE 2024.07.07
SAMSUNG - SM-R925F
IMEI: 351876764733760 B
`

  const result = parsePhoneMetadata(rawText, [])

  assert.equal(result.metadata.brand, 'Samsung')
  assert.equal(result.metadata.deviceName, 'Galaxy Watch5 Pro LTE (45mm)')
  assert.equal(result.metadata.modelNumber, 'SM-R925F')
  assert.deepEqual(result.metadata.imeis, ['351876764733760'])
  assert.deepEqual(result.metadata.eids, ['89043081202200836223027016618642'])
  assert.equal(result.metadata.lookupProof?.source, 'exact_model_code')
})

test('resolves the Samsung sample from barcode-only identifiers through IMEI TAC', () => {
  const result = parsePhoneMetadata('', [
    { format: 'code_128', rawValue: '351876764733760' },
    { format: 'code_128', rawValue: '89043081202200836223027016618642' },
  ])

  assert.equal(result.metadata.brand, 'Samsung')
  assert.equal(result.metadata.deviceName, 'Galaxy Watch5 Pro LTE (45mm)')
  assert.equal(result.metadata.modelNumber, 'SM-R925F')
  assert.deepEqual(result.metadata.imeis, ['351876764733760'])
  assert.deepEqual(result.metadata.eids, ['89043081202200836223027016618642'])
  assert.equal(result.metadata.lookupProof?.source, 'imei_tac')
})

test('recovers valid identifiers when OCR mangles the English label', () => {
  const rawText = `
Ti 351876764733760
00 ODA OOO
0 89043081202200836223027016618642
MANUFACTURE DATE 2024 07 07
`

  const result = parsePhoneMetadata(rawText, [])

  assert.deepEqual(result.metadata.imeis, ['351876764733760'])
  assert.deepEqual(result.metadata.eids, ['89043081202200836223027016618642'])
  assert.equal(result.metadata.lookupProof?.source, 'imei_tac')
})

test('falls back to family-level proof when only a major-brand model code is known', () => {
  const rawText = `
OPPO : CPH2603
IMEI 867530900000001
`

  const result = parsePhoneMetadata(rawText, [])

  assert.equal(result.metadata.brand, 'OPPO')
  assert.equal(result.metadata.modelNumber, 'CPH2603')
  assert.equal(result.metadata.lookupProof?.source, 'model_code_family')
  assert.match(result.metadata.notes.join(' '), /family match/i)
})
