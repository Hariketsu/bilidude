import { useTranslation } from 'react-i18next';
import { deepseekCredential } from '@/lib/deepseekAccount';
import type { Settings } from '@/lib/settings';
import { Group, Hint, TextInput } from './SettingsUi';

/** The DeepSeek key behind web search, which models from other providers need on its own. */
export function WebSearchSettings({ value, onChange }: { value: Settings['llm']; onChange: (llm: Settings['llm']) => void }) {
  const { t } = useTranslation();
  const deepseekModel = value.provider === 'deepseek';
  const byAccount = deepseekCredential(value)?.kind === 'account';
  return (
    <Group title={t('settings.webSearch.title')} footer={t(deepseekModel ? 'settings.webSearch.deepseekNote' : 'settings.webSearch.apiNote')}>
      {deepseekModel || byAccount ? (
        <Hint>{t(byAccount ? 'settings.webSearch.sharedAccount' : 'settings.webSearch.sharedKey')}</Hint>
      ) : (
        <TextInput
          label={t('settings.webSearch.apiKey')}
          secret
          placeholder={t('settings.webSearch.optional')}
          value={value.apiKeys.deepseek ?? ''}
          onChange={(key) => onChange({ ...value, apiKeys: { ...value.apiKeys, deepseek: key } })}
        />
      )}
    </Group>
  );
}
