// The countries an operator can be created in (CLAUDE.md §13). An operator's
// country is fixed at creation; everything a screen says about phone numbers,
// business registration, tax and money comes from this profile — never from a
// constant in feature code.

export const COUNTRY_CODES = ['MY', 'SG'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export interface CountryField {
  label: string;
  placeholder: string;
}

export interface CountryProfile {
  code: CountryCode;
  name: string;
  currency: string;
  /** Written before an amount: "RM 12.30", "S$ 12.30". */
  currencySymbol: string;
  numberLocale: string;
  timezone: string;
  dialCode: string;
  phonePlaceholder: string;
  /** Whether addresses carry a state. */
  hasStates: boolean;
  postcodeLabel: string;
  postcodePlaceholder: string;
  legalNamePlaceholder: string;
  /** The company registry number. */
  businessRegistration: CountryField;
  /** A separate income-tax number, where the country has one. */
  taxIdentification: CountryField | null;
  /** The sales-tax (SST / GST) registration number. */
  salesTaxRegistration: CountryField;
  /** Short name of the sales tax, used for the default tax profile. */
  salesTaxCode: string;
  /** The national e-invoicing scheme, named on invoice-identity sections. */
  eInvoiceScheme: string;
}

export const COUNTRIES: Record<CountryCode, CountryProfile> = {
  MY: {
    code: 'MY',
    name: 'Malaysia',
    currency: 'MYR',
    currencySymbol: 'RM',
    numberLocale: 'en-MY',
    timezone: 'Asia/Kuala_Lumpur',
    dialCode: '+60',
    phonePlaceholder: '+60 12 345 6789',
    hasStates: true,
    postcodeLabel: 'Postcode',
    postcodePlaceholder: '50450',
    legalNamePlaceholder: 'e.g. Voltara Sdn. Bhd.',
    businessRegistration: {
      label: 'Business registration no. (SSM)',
      placeholder: '202001012345 (1234567-X)',
    },
    taxIdentification: { label: 'Tax identification no. (TIN)', placeholder: 'C12345678900' },
    salesTaxRegistration: {
      label: 'SST registration no.',
      placeholder: 'Leave empty until registered',
    },
    salesTaxCode: 'SST',
    eInvoiceScheme: 'MyInvois',
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    currencySymbol: 'S$',
    numberLocale: 'en-SG',
    timezone: 'Asia/Singapore',
    dialCode: '+65',
    phonePlaceholder: '+65 8123 4567',
    hasStates: false,
    postcodeLabel: 'Postal code',
    postcodePlaceholder: '238823',
    legalNamePlaceholder: 'e.g. Voltara Pte. Ltd.',
    // ACRA's Unique Entity Number is the company's registration number and its
    // tax reference with IRAS — Singapore has no separate TIN.
    businessRegistration: { label: 'UEN', placeholder: '201912345K' },
    taxIdentification: null,
    salesTaxRegistration: {
      label: 'GST registration no.',
      placeholder: 'Leave empty unless GST-registered',
    },
    salesTaxCode: 'GST',
    eInvoiceScheme: 'InvoiceNow',
  },
};

export function countryProfile(code: string | null | undefined): CountryProfile {
  return COUNTRIES[(code ?? 'MY') as CountryCode] ?? COUNTRIES.MY;
}

// ── Display currency ────────────────────────────────────────────────────────
// An operator session is in exactly one country, so money is displayed in one
// currency for the life of the page. The app shell sets it once at sign-in;
// the money formatters read it. Amounts are still stored with their own
// currency — this only decides the symbol on screen.

let display: Pick<CountryProfile, 'currencySymbol' | 'numberLocale'> = COUNTRIES.MY;

export function setDisplayCountry(code: string | null | undefined): void {
  display = countryProfile(code);
}

export function displayCurrencySymbol(): string {
  return display.currencySymbol;
}

export function displayNumberLocale(): string {
  return display.numberLocale;
}
