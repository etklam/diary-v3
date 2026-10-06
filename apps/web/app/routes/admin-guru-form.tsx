import { useState, type FormEvent } from 'react'
import { adminGuruCreateRequestSchema, type AdminGuru } from '@diary/contracts/admin-gurus'
import { FailureNotice, invalidField, type Failure } from '../api-error'
import { useUi } from '../ui'
import { guruAdminCopy } from './admin-gurus-copy'

type GuruFormValue = {
  profile: AdminGuru['profile']
  manager: { cik: string }
}

type Props = {
  initial?: AdminGuru | null
  saving: boolean
  failure: Failure | null
  failureMessage: string
  submitLabel: string
  cancelLabel: string
  onSubmit: (value: GuruFormValue) => void | Promise<void>
  onCancel: () => void
  onEdit: () => void
}

const directoryOrderLabel = { en: 'Custom directory order', 'zh-TW': '目錄自訂排序', 'zh-CN': '目录自定义排序' } as const

function emptyProfile(): GuruFormValue {
  return {
    profile: {
      name: '', managerName: '', slug: '', description: null, investmentPhilosophy: null,
      styleTags: [], managerType: null, website: null, country: null, imageUrl: null,
      securityNotes: null, featured: false, active: true, directoryOrder: 0,
    },
    manager: { cik: '' },
  }
}

function fromGuru(guru: AdminGuru): GuruFormValue {
  return { profile: { ...guru.profile, styleTags: [...guru.profile.styleTags] }, manager: { cik: guru.manager.cik } }
}

export function AdminGuruForm({ initial, saving, failure, failureMessage, submitLabel, cancelLabel, onSubmit, onCancel, onEdit }: Props) {
  const { locale } = useUi()
  const c = guruAdminCopy[locale]
  const [form, setForm] = useState<GuruFormValue>(() => initial ? fromGuru(initial) : emptyProfile())
  const [localFields, setLocalFields] = useState<string[]>([])
  const profile = form.profile

  function updateProfile(key: keyof AdminGuru['profile'], value: AdminGuru['profile'][keyof AdminGuru['profile']]) {
    setForm(current => ({ ...current, profile: { ...current.profile, [key]: value } }))
    setLocalFields([])
    onEdit()
  }

  function updateCik(value: string) {
    setForm(current => ({ ...current, manager: { cik: value } }))
    setLocalFields([])
    onEdit()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = adminGuruCreateRequestSchema.safeParse(form)
    if (!parsed.success) {
      setLocalFields(parsed.error.issues.map(issue => issue.path.join('.')))
      return
    }
    setLocalFields([])
    await onSubmit(parsed.data)
  }

  const invalid = (field: string) => localFields.some(item => item === field || item.endsWith(`.${field}`)) || invalidField(failure, field)

  return <form className="admin-guru-form" onSubmit={event => void submit(event)} noValidate aria-busy={saving}>
    <fieldset disabled={saving}>
      {failure && <FailureNotice failure={failure} id="admin-guru-form-error" messageOverride={failureMessage} focusField />}
      {localFields.length > 0 && <p className="error admin-guru-validation" role="alert">{c.validation}</p>}
      <section className="admin-guru-form-section" aria-labelledby="admin-guru-editorial-title">
        <h2 id="admin-guru-editorial-title">{c.profileSection}</h2>
        <div className="admin-guru-form-grid">
          <label>{c.nameField}<input autoComplete="off" required maxLength={200} value={profile.name} onChange={event => updateProfile('name', event.target.value)} aria-invalid={invalid('name')} /></label>
          <label>{c.managerField}<input autoComplete="off" required maxLength={200} value={profile.managerName} onChange={event => updateProfile('managerName', event.target.value)} aria-invalid={invalid('managerName')} /></label>
          <label>{c.slugField}<input autoComplete="off" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={profile.slug} onChange={event => updateProfile('slug', event.target.value)} aria-invalid={invalid('slug')} /></label>
          <label>{c.managerType}<span className="admin-guru-optional">{c.optional}</span><input maxLength={80} value={profile.managerType ?? ''} onChange={event => updateProfile('managerType', event.target.value.trim() ? event.target.value : null)} aria-invalid={invalid('managerType')} /></label>
          <label className="admin-guru-wide">{c.description}<span className="admin-guru-optional">{c.optional}</span><textarea rows={3} maxLength={10000} value={profile.description ?? ''} onChange={event => updateProfile('description', event.target.value || null)} aria-invalid={invalid('description')} /></label>
          <label className="admin-guru-wide">{c.philosophy}<span className="admin-guru-optional">{c.optional}</span><textarea rows={3} maxLength={10000} value={profile.investmentPhilosophy ?? ''} onChange={event => updateProfile('investmentPhilosophy', event.target.value || null)} aria-invalid={invalid('investmentPhilosophy')} /></label>
          <label className="admin-guru-wide">{c.tags}<span className="admin-guru-optional">{c.optional}</span><input value={profile.styleTags.join(', ')} onChange={event => updateProfile('styleTags', event.target.value.split(',').map(tag => tag.trim()).filter(Boolean))} aria-describedby="admin-guru-tags-hint" aria-invalid={invalid('styleTags')} /><span className="field-hint" id="admin-guru-tags-hint">{c.tagsHint}</span></label>
          <label>{c.website}<span className="admin-guru-optional">{c.optional}</span><input type="url" maxLength={2048} value={profile.website ?? ''} onChange={event => updateProfile('website', event.target.value || null)} aria-invalid={invalid('website')} /></label>
          <label>{c.country}<span className="admin-guru-optional">{c.optional}</span><input autoCapitalize="characters" maxLength={2} value={profile.country ?? ''} onChange={event => updateProfile('country', event.target.value.toUpperCase() || null)} aria-invalid={invalid('country')} /></label>
          <label className="admin-guru-wide">{c.imageUrl}<span className="admin-guru-optional">{c.optional}</span><input type="url" maxLength={2048} value={profile.imageUrl ?? ''} onChange={event => updateProfile('imageUrl', event.target.value || null)} aria-invalid={invalid('imageUrl')} /></label>
          <label className="admin-guru-wide">{c.securityNotes}<span className="admin-guru-optional">{c.optional}</span><textarea rows={3} maxLength={10000} value={profile.securityNotes ?? ''} onChange={event => updateProfile('securityNotes', event.target.value || null)} aria-invalid={invalid('securityNotes')} /></label>
          <label>{directoryOrderLabel[locale]}<input type="number" min={-999999} max={999999} step={1} value={profile.directoryOrder} onChange={event => updateProfile('directoryOrder', Number(event.target.value))} aria-invalid={invalid('directoryOrder')} /></label>
          <div className="admin-guru-checks">
            <label><input type="checkbox" checked={profile.featured} onChange={event => updateProfile('featured', event.target.checked)} />{c.featuredField}</label>
            <label><input type="checkbox" checked={profile.active} onChange={event => updateProfile('active', event.target.checked)} />{c.activeField}</label>
          </div>
        </div>
      </section>
      <section className="admin-guru-form-section" aria-labelledby="admin-guru-manager-title">
        <h2 id="admin-guru-manager-title">{c.managerSection}</h2>
        <p className="field-hint">{c.identityHint}</p>
        <label>{c.cikField}<input inputMode="numeric" autoComplete="off" required maxLength={10} pattern="[0-9]{1,10}" value={form.manager.cik} onChange={event => updateCik(event.target.value)} aria-invalid={invalid('cik')} /></label>
        <p className="field-hint">{c.cikHint}</p>
      </section>
      <div className="admin-guru-form-actions">
        <button type="submit" disabled={saving}>{saving ? c.saving : submitLabel}</button>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </fieldset>
  </form>
}
