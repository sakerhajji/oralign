import type { Metadata } from 'next';
import { HelpContent } from './help-content';

export const metadata: Metadata = {
  title: 'Aide et informations légales | Oralign',
};

export default function HelpPage() {
  return <HelpContent />;
}
