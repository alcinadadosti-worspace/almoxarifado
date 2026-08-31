import { useState } from 'react';
import { IconCheck, IconCopy } from '@/components/icons';
import { Button, type ButtonProps } from '@/components/ui/Button';

interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  value: string;
  label?: string;
  copiedLabel?: string;
  onCopied?: () => void;
}

/** Copia para a área de transferência com fallback para navegadores antigos. */
export function CopyButton({
  value,
  label = 'Copiar link',
  copiedLabel = 'Copiado!',
  onCopied,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement('textarea');
        area.value = value;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button
      {...rest}
      onClick={copy}
      icon={copied ? <IconCheck width={15} height={15} /> : <IconCopy width={15} height={15} />}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
