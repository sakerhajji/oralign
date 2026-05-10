export interface Country {
  iso2: string;
  name: string;
  dialCode: string;
}

export const COUNTRIES: Country[] = [
  { iso2: 'AF', name: 'Afghanistan', dialCode: '+93' },
  { iso2: 'DZ', name: 'Algeria', dialCode: '+213' },
  { iso2: 'AR', name: 'Argentina', dialCode: '+54' },
  { iso2: 'AU', name: 'Australia', dialCode: '+61' },
  { iso2: 'AT', name: 'Austria', dialCode: '+43' },
  { iso2: 'BH', name: 'Bahrain', dialCode: '+973' },
  { iso2: 'BD', name: 'Bangladesh', dialCode: '+880' },
  { iso2: 'BE', name: 'Belgium', dialCode: '+32' },
  { iso2: 'BR', name: 'Brazil', dialCode: '+55' },
  { iso2: 'CA', name: 'Canada', dialCode: '+1' },
  { iso2: 'CN', name: 'China', dialCode: '+86' },
  { iso2: 'CO', name: 'Colombia', dialCode: '+57' },
  { iso2: 'HR', name: 'Croatia', dialCode: '+385' },
  { iso2: 'CZ', name: 'Czech Republic', dialCode: '+420' },
  { iso2: 'DK', name: 'Denmark', dialCode: '+45' },
  { iso2: 'EG', name: 'Egypt', dialCode: '+20' },
  { iso2: 'ET', name: 'Ethiopia', dialCode: '+251' },
  { iso2: 'FI', name: 'Finland', dialCode: '+358' },
  { iso2: 'FR', name: 'France', dialCode: '+33' },
  { iso2: 'DE', name: 'Germany', dialCode: '+49' },
  { iso2: 'GH', name: 'Ghana', dialCode: '+233' },
  { iso2: 'GR', name: 'Greece', dialCode: '+30' },
  { iso2: 'HU', name: 'Hungary', dialCode: '+36' },
  { iso2: 'IN', name: 'India', dialCode: '+91' },
  { iso2: 'ID', name: 'Indonesia', dialCode: '+62' },
  { iso2: 'IR', name: 'Iran', dialCode: '+98' },
  { iso2: 'IQ', name: 'Iraq', dialCode: '+964' },
  { iso2: 'IE', name: 'Ireland', dialCode: '+353' },
  { iso2: 'IL', name: 'Israel', dialCode: '+972' },
  { iso2: 'IT', name: 'Italy', dialCode: '+39' },
  { iso2: 'JP', name: 'Japan', dialCode: '+81' },
  { iso2: 'JO', name: 'Jordan', dialCode: '+962' },
  { iso2: 'KE', name: 'Kenya', dialCode: '+254' },
  { iso2: 'KW', name: 'Kuwait', dialCode: '+965' },
  { iso2: 'LB', name: 'Lebanon', dialCode: '+961' },
  { iso2: 'LY', name: 'Libya', dialCode: '+218' },
  { iso2: 'MY', name: 'Malaysia', dialCode: '+60' },
  { iso2: 'MV', name: 'Maldives', dialCode: '+960' },
  { iso2: 'MR', name: 'Mauritania', dialCode: '+222' },
  { iso2: 'MX', name: 'Mexico', dialCode: '+52' },
  { iso2: 'MA', name: 'Morocco', dialCode: '+212' },
  { iso2: 'NL', name: 'Netherlands', dialCode: '+31' },
  { iso2: 'NZ', name: 'New Zealand', dialCode: '+64' },
  { iso2: 'NG', name: 'Nigeria', dialCode: '+234' },
  { iso2: 'NO', name: 'Norway', dialCode: '+47' },
  { iso2: 'OM', name: 'Oman', dialCode: '+968' },
  { iso2: 'PK', name: 'Pakistan', dialCode: '+92' },
  { iso2: 'PS', name: 'Palestine', dialCode: '+970' },
  { iso2: 'PH', name: 'Philippines', dialCode: '+63' },
  { iso2: 'PL', name: 'Poland', dialCode: '+48' },
  { iso2: 'PT', name: 'Portugal', dialCode: '+351' },
  { iso2: 'QA', name: 'Qatar', dialCode: '+974' },
  { iso2: 'RO', name: 'Romania', dialCode: '+40' },
  { iso2: 'RU', name: 'Russia', dialCode: '+7' },
  { iso2: 'SA', name: 'Saudi Arabia', dialCode: '+966' },
  { iso2: 'SN', name: 'Senegal', dialCode: '+221' },
  { iso2: 'RS', name: 'Serbia', dialCode: '+381' },
  { iso2: 'SG', name: 'Singapore', dialCode: '+65' },
  { iso2: 'ZA', name: 'South Africa', dialCode: '+27' },
  { iso2: 'KR', name: 'South Korea', dialCode: '+82' },
  { iso2: 'ES', name: 'Spain', dialCode: '+34' },
  { iso2: 'SD', name: 'Sudan', dialCode: '+249' },
  { iso2: 'SE', name: 'Sweden', dialCode: '+46' },
  { iso2: 'CH', name: 'Switzerland', dialCode: '+41' },
  { iso2: 'SY', name: 'Syria', dialCode: '+963' },
  { iso2: 'TW', name: 'Taiwan', dialCode: '+886' },
  { iso2: 'TZ', name: 'Tanzania', dialCode: '+255' },
  { iso2: 'TH', name: 'Thailand', dialCode: '+66' },
  { iso2: 'TN', name: 'Tunisia', dialCode: '+216' },
  { iso2: 'TR', name: 'Turkey', dialCode: '+90' },
  { iso2: 'UG', name: 'Uganda', dialCode: '+256' },
  { iso2: 'AE', name: 'United Arab Emirates', dialCode: '+971' },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { iso2: 'US', name: 'United States', dialCode: '+1' },
  { iso2: 'UZ', name: 'Uzbekistan', dialCode: '+998' },
  { iso2: 'VN', name: 'Vietnam', dialCode: '+84' },
  { iso2: 'YE', name: 'Yemen', dialCode: '+967' },
].sort((a, b) => a.name.localeCompare(b.name));

/** Convert ISO 3166-1 alpha-2 code to flag emoji */
export function toFlagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

export function findByName(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function findByDialCode(dialCode: string): Country | undefined {
  return COUNTRIES.find((c) => c.dialCode === dialCode);
}
