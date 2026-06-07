import { Router } from "express";

const router = Router();

router.get("/cast", (req, res) => {
  const url   = (req.query["url"]   as string) ?? "";
  const title = (req.query["title"] as string) ?? "NETPLAY";

  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeUrl   = url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const isM3u8 = /m3u8/i.test(url);

  const hlsBlock = isM3u8 ? `
    const hlsScript = document.createElement('script');
    hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    hlsScript.onload = function () {
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 120, enableWorker: false });
        hls.loadSource(src);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, function () { v.play().catch(function(){}); });
        hls.on(Hls.Events.ERROR, function(e, d) {
          if (d.fatal) showError('Erro HLS: ' + (d.details || 'desconhecido'));
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = src;
        v.play().catch(function(){});
      } else {
        showError('HLS não suportado neste navegador.');
      }
    };
    document.head.appendChild(hlsScript);
  ` : `
    v.src = src;
    v.onerror = function () { showError('Erro ao carregar vídeo. A sessão pode ter expirado.'); };
    v.play().catch(function(){});
    v.addEventListener('loadedmetadata', function () {
      v.requestFullscreen && v.requestFullscreen().catch(function(){});
    }, { once: true });
  `;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <title>NETPLAY · ${safeTitle}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#000;color:#fff;width:100vw;height:100vh;overflow:hidden;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    #vid{width:100vw;height:100vh;object-fit:contain;background:#000;display:block}
    #logo{position:fixed;top:18px;left:20px;font-size:22px;font-weight:900;
          letter-spacing:1.5px;z-index:20;opacity:.85;pointer-events:none;
          text-shadow:0 2px 8px rgba(0,0,0,.9)}
    .net{color:#e50914}
    #title-bar{position:fixed;bottom:0;left:0;right:0;
               background:linear-gradient(transparent,rgba(0,0,0,.92));
               padding:28px 24px 22px;z-index:20;opacity:0;
               transition:opacity .6s;pointer-events:none}
    #title-bar.vis{opacity:1}
    #title-text{font-size:20px;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.9)}
    #error{display:none;position:fixed;inset:0;flex-direction:column;align-items:center;
           justify-content:center;gap:14px;padding:20px;text-align:center;z-index:30}
    #error.vis{display:flex}
    #err-ico{font-size:48px}
    #err-title{font-size:22px;font-weight:800;color:#e50914}
    #err-msg{font-size:14px;color:rgba(255,255,255,.6);max-width:360px;line-height:1.5}
  </style>
</head>
<body>
  <div id="logo"><span class="net">NET</span>PLAY</div>
  <div id="title-bar"><div id="title-text">${safeTitle}</div></div>
  <div id="error">
    <div id="err-ico">⚠️</div>
    <div id="err-title">Erro ao carregar</div>
    <div id="err-msg" id="error-msg"></div>
  </div>
  <video id="vid" controls playsinline webkit-playsinline></video>
  <script>
    var src = "${safeUrl}";
    var v   = document.getElementById('vid');
    var tb  = document.getElementById('title-bar');
    var err = document.getElementById('error');
    var errMsg = document.getElementById('err-msg');

    function showError(msg) {
      v.style.display = 'none';
      errMsg.textContent = msg || 'Não foi possível reproduzir o conteúdo.';
      err.classList.add('vis');
    }

    if (!src) {
      showError('URL do vídeo não especificada.');
    } else {
      /* title overlay — show for 4s then fade */
      tb.classList.add('vis');
      setTimeout(function(){ tb.classList.remove('vis'); }, 4000);
      ${hlsBlock}
    }

    /* show title on tap */
    document.body.addEventListener('click', function(){
      tb.classList.add('vis');
      clearTimeout(window._thide);
      window._thide = setTimeout(function(){ tb.classList.remove('vis'); }, 3000);
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

export default router;
