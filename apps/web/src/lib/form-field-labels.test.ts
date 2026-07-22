import { describe, expect, test } from 'vitest'
import { FORM_FIELD_LABELS, resolveFormFieldLabel } from './form-field-labels'

describe('resolveFormFieldLabel', () => {
  test('target_area / target_areas は対象箇所', () => {
    expect(resolveFormFieldLabel('target_area')).toBe('対象箇所')
    expect(resolveFormFieldLabel('target_areas')).toBe('対象箇所')
    expect(FORM_FIELD_LABELS.target_area_detail).toBe('対象箇所（詳細）')
  })

  test('request_detail / request_preference はご要望', () => {
    expect(resolveFormFieldLabel('request_detail')).toBe('ご要望')
    expect(resolveFormFieldLabel('request_preference')).toBe('ご要望')
  })

  test('forms.fields のラベルがあればそれを優先', () => {
    expect(
      resolveFormFieldLabel('request_detail', { request_detail: 'ご要望の詳細' }),
    ).toBe('ご要望の詳細')
  })

  test('未知キーはそのまま', () => {
    expect(resolveFormFieldLabel('unknown_custom_field')).toBe('unknown_custom_field')
  })
})
