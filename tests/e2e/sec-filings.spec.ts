import { execFileSync } from 'node:child_process'
import { expect, test, selectLocale } from '../support/e2e'

const company = { cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'], matchedBy: 'ticker' }
const filing = { cik: company.cik, accession: '0000000001-24-000001', filingDate: '2024-04-01', reportDate: '2023-12-31', acceptanceDateTime: '2024-04-01 12:00:00', form: '10-K', isAmendment: false, primaryDocument: 'syn-10k.htm', primaryDocumentDescription: 'Annual report', fileNumber: '1', filmNumber: null, items: null, size: 120 }

function assertZip(downloadPath: string, expectedNames: string[], bodyEntry: string, expectedBody: string) {
  const integrity = execFileSync('unzip', ['-t', downloadPath], { encoding: 'utf8' })
  expect(integrity).toContain('No errors detected')
  const names = execFileSync('unzip', ['-Z1', downloadPath], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
  expect(names).toEqual(expect.arrayContaining(expectedNames))
  const body = execFileSync('unzip', ['-p', downloadPath, bodyEntry], { encoding: 'utf8' })
  expect(body).toContain(expectedBody)
}

test('searches SEC company, filters filings, selects a batch and reads document detail', async ({ page }) => {
  await page.goto('/tools/sec-filings')
  await selectLocale(page, 'en')
  await page.getByLabel('Company, ticker, or CIK', { exact: true }).fill('SYN')
  await page.getByRole('button', { name: 'Search SEC', exact: true }).click()
  await expect(page.getByRole('button', { name: /Synthetic Holdings/ })).toBeVisible()
  await page.getByRole('button', { name: /Synthetic Holdings/ }).click()
  await expect(page.getByRole('cell', { name: '10-K' })).toBeVisible()
  await page.getByRole('checkbox', { name: `Select ${filing.accession}` }).check()
  await expect(page.getByRole('link', { name: 'Download batch ZIP', exact: true })).toHaveAttribute('href', /accessions=0000000001-24-000001/)
  const batchDownloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download batch ZIP', exact: true }).click()
  const batchDownload = await batchDownloadPromise
  const batchPath = await batchDownload.path()
  expect(batchPath).toBeTruthy()
  assertZip(batchPath!, ['manifest.json', '001-SYN_10-K_2024-04-01_0000000001-24-000001_syn-10k.htm'], '001-SYN_10-K_2024-04-01_0000000001-24-000001_syn-10k.htm', 'synthetic-sec-document:')
  await page.screenshot({ path: 'docs/design/evidence/sec-filings/desktop.png', fullPage: true })
  await page.getByRole('link', { name: '10-K', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '10-K', exact: true })).toBeVisible()
  await expect(page.getByText('syn-10k.htm', { exact: true })).toBeVisible()
  const singleDownloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download all as ZIP', exact: true }).click()
  const singleDownload = await singleDownloadPromise
  const singlePath = await singleDownload.path()
  expect(singlePath).toBeTruthy()
  assertZip(singlePath!, ['manifest.json', 'syn-10k.htm', `${filing.accession}.txt`], 'syn-10k.htm', 'synthetic-sec-document:')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/design/evidence/sec-filings/mobile.png', fullPage: true })
  await selectLocale(page, 'zh-TW')
  await expect(page.getByRole('link', { name: /返回申報/ })).toBeVisible()
})
