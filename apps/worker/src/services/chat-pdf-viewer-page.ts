/** LINE 内ブラウザ向け PDF ビューア HTML（Web Share API で実ファイル保存） */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ChatPdfViewerPageParams = {
  fileName: string;
  pdfUrl: string;
  expiresAtLabel?: string;
};

export function renderChatPdfViewerPage(params: ChatPdfViewerPageParams): string {
  const fileName = escapeHtml(params.fileName);
  const pdfUrl = escapeHtml(params.pdfUrl);
  const expiresNote = params.expiresAtLabel
    ? `<p class="meta">リンク有効期限: ${escapeHtml(params.expiresAtLabel)}まで</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fileName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
      background: #f5f5f5;
      color: #222;
      padding: 16px;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    h1 { font-size: 1rem; margin: 0 0 8px; word-break: break-all; }
    .meta { font-size: 0.75rem; color: #888; margin: 0 0 12px; }
    .preview {
      width: 100%;
      height: min(55vh, 480px);
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      background: #fafafa;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px 16px;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
    }
    .btn-primary { background: #06C755; color: #fff; margin-bottom: 10px; }
    .btn-primary:disabled { opacity: 0.6; }
    .btn-secondary { background: #fff; color: #333; border: 1px solid #ddd; }
    .hint { font-size: 0.75rem; color: #666; line-height: 1.5; margin: 12px 0 0; }
    .status { font-size: 0.8rem; color: #c00; margin-top: 8px; min-height: 1.2em; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📎 ${fileName}</h1>
    ${expiresNote}
    <embed class="preview" src="${pdfUrl}#toolbar=1" type="application/pdf" />
  </div>
  <div class="card">
    <button type="button" class="btn btn-primary" id="saveBtn">ファイルに保存</button>
    <a class="btn btn-secondary" id="openRaw" href="${pdfUrl}" target="_blank" rel="noopener">PDFを別タブで開く</a>
    <p class="hint">
      <strong>iPhone の場合:</strong> 上の緑ボタン → 共有シートで「ファイルに保存」を選ぶと PDF として保存できます。<br>
      うまくいかない場合は「PDFを別タブで開く」→ 画面下の共有ボタン（□↑）から保存してください。
    </p>
    <p class="status" id="status" aria-live="polite"></p>
  </div>
  <script>
    (function () {
      var pdfUrl = ${JSON.stringify(params.pdfUrl)};
      var fileName = ${JSON.stringify(params.fileName)};
      var btn = document.getElementById('saveBtn');
      var status = document.getElementById('status');

      btn.addEventListener('click', function () {
        status.textContent = '準備中...';
        btn.disabled = true;
        fetch(pdfUrl, { credentials: 'omit' })
          .then(function (res) {
            if (!res.ok) throw new Error('PDF を取得できませんでした (' + res.status + ')');
            return res.blob();
          })
          .then(function (blob) {
            var file = new File([blob], fileName, { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              return navigator.share({ files: [file], title: fileName });
            }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
            status.textContent = 'ダウンロードを開始しました';
          })
          .catch(function (err) {
            status.textContent = err && err.message ? err.message : '保存に失敗しました';
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    })();
  </script>
</body>
</html>`;
}
