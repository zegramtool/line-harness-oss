/** LINE Flex — PDF 用（Messaging API に file 送信がないためビューアページへ誘導） */

export function buildPdfLinkFlex(fileName: string, viewerUrl: string, expiresAtLabel?: string) {
  const bodyContents: Array<Record<string, unknown>> = [
    { type: 'text', text: 'PDFファイル', weight: 'bold', size: 'md', color: '#333333' },
    { type: 'text', text: fileName, size: 'sm', color: '#666666', wrap: true },
  ];
  if (expiresAtLabel) {
    bodyContents.push({
      type: 'text',
      text: `※ リンク有効期限: ${expiresAtLabel}まで`,
      size: 'xs',
      color: '#888888',
      wrap: true,
      margin: 'md',
    });
  }

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: bodyContents,
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#06C755',
          action: { type: 'uri', label: 'PDFを開く', uri: viewerUrl },
        },
      ],
      paddingAll: '12px',
    },
  };
}
