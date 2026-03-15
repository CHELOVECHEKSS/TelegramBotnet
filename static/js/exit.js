(function() {
    'use strict';

    function showExitDialog() {
        new Audio('/assets/audio/mp3/warning.mp3').play().catch(function(){});

        var overlay = document.createElement('div');
        overlay.id = 'exit-dialog-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:999999',
            'background:rgba(0,0,0,0.92)',
            'display:flex', 'align-items:center', 'justify-content:center',
        ].join(';');

        overlay.innerHTML = [
            '<div style="border:1px solid #ff3333;padding:2.5rem 3rem;text-align:center;min-width:360px;background:#000;position:relative;">',
            '<div style="position:absolute;top:8px;left:8px;width:16px;height:16px;border-top:1px solid #ff3333;border-left:1px solid #ff3333;"></div>',
            '<div style="position:absolute;top:8px;right:8px;width:16px;height:16px;border-top:1px solid #ff3333;border-right:1px solid #ff3333;"></div>',
            '<div style="position:absolute;bottom:8px;left:8px;width:16px;height:16px;border-bottom:1px solid #ff3333;border-left:1px solid #ff3333;"></div>',
            '<div style="position:absolute;bottom:8px;right:8px;width:16px;height:16px;border-bottom:1px solid #ff3333;border-right:1px solid #ff3333;"></div>',
            '<div style="font-family:FiraCode,monospace;color:#ff3333;font-size:0.7rem;letter-spacing:0.4em;margin-bottom:1.5rem;">⚠ &nbsp; W A R N I N G &nbsp; ⚠</div>',
            '<div style="font-family:FiraMono,monospace;color:#ccc;font-size:0.9rem;letter-spacing:0.05em;margin-bottom:2rem;">Вы действительно хотите выйти?</div>',
            '<div style="display:flex;gap:1rem;justify-content:center;">',
            '<button id="exit-cancel-btn" style="background:transparent;color:#555;border:1px solid #333;font-family:FiraCode,monospace;font-size:0.8rem;padding:0.5rem 1.4rem;cursor:pointer;letter-spacing:0.1em;">[ ОТМЕНА ]</button>',
            '<button id="exit-confirm-btn" style="background:transparent;color:#ff3333;border:1px solid #ff3333;font-family:FiraCode,monospace;font-size:0.8rem;padding:0.5rem 1.4rem;cursor:pointer;letter-spacing:0.1em;">[ ВЫХОД ]</button>',
            '</div></div>',
        ].join('');

        document.body.appendChild(overlay);

        var cancelBtn  = document.getElementById('exit-cancel-btn');
        var confirmBtn = document.getElementById('exit-confirm-btn');

        cancelBtn.onmouseover  = function() { cancelBtn.style.color = '#888'; cancelBtn.style.borderColor = '#555'; };
        cancelBtn.onmouseout   = function() { cancelBtn.style.color = '#555'; cancelBtn.style.borderColor = '#333'; };
        confirmBtn.onmouseover = function() { confirmBtn.style.background = '#ff3333'; confirmBtn.style.color = '#000'; };
        confirmBtn.onmouseout  = function() { confirmBtn.style.background = 'transparent'; confirmBtn.style.color = '#ff3333'; };

        cancelBtn.onclick  = function() { overlay.remove(); };
        confirmBtn.onclick = function() {
            overlay.remove();
            new Audio('/assets/audio/mp3/exit.mp3').play().catch(function(){});
            startOutro();
        };
    }

    function startOutro() {
        var outro = document.createElement('div');
        outro.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9999999',
            'background:#000',
            'display:flex', 'flex-direction:column',
            'align-items:center', 'justify-content:center',
            'opacity:0', 'transition:opacity 0.3s ease',
        ].join(';');

        // Matrix canvas
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;opacity:0.12;';
        outro.appendChild(canvas);

        // Угловые рамки
        [
            'top:20px;left:20px;border-top:2px solid #2AABEE;border-left:2px solid #2AABEE;',
            'top:20px;right:20px;border-top:2px solid #2AABEE;border-right:2px solid #2AABEE;',
            'bottom:20px;left:20px;border-bottom:2px solid #2AABEE;border-left:2px solid #2AABEE;',
            'bottom:20px;right:20px;border-bottom:2px solid #2AABEE;border-right:2px solid #2AABEE;',
        ].forEach(function(s) {
            var c = document.createElement('div');
            c.style.cssText = 'position:absolute;width:40px;height:40px;' + s;
            outro.appendChild(c);
        });

        // Логотип (Telegram SVG inline)
        var logoWrap = document.createElement('div');
        logoWrap.style.cssText = 'position:relative;width:80px;height:80px;margin-bottom:1.5rem;';
        logoWrap.innerHTML = '<svg viewBox="0 0 24 24" style="width:80px;height:80px;color:#2AABEE;filter:drop-shadow(0 0 20px #2AABEE);transition:transform 0.3s ease-in,opacity 0.3s ease-in;" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.92c-.12.56-.44.7-.9.44l-2.48-1.83-1.2 1.15c-.13.13-.24.24-.5.24l.18-2.52 4.6-4.16c.2-.18-.04-.28-.31-.1L7.4 14.47 4.96 13.7c-.54-.17-.55-.54.11-.8l9.4-3.62c.45-.16.84.11.17.52z"/></svg>';
        var logoSvg = logoWrap.querySelector('svg');
        outro.appendChild(logoWrap);

        // Заголовок
        var title = document.createElement('div');
        title.style.cssText = 'font-family:FiraCode,monospace;font-size:2.5rem;color:#2AABEE;letter-spacing:0.4em;text-shadow:0 0 20px rgba(42,171,238,0.6);margin-bottom:0.5rem;min-height:3.5rem;';
        title.textContent = 'TelegramBotnet';
        outro.appendChild(title);

        // Subtitle
        var sub = document.createElement('div');
        sub.style.cssText = 'font-family:FiraMono,monospace;font-size:0.7rem;color:#555;letter-spacing:0.5em;margin-bottom:2rem;transition:opacity 0.4s ease;';
        sub.textContent = 'TELEGRAM BROADCAST TOOLKIT';
        outro.appendChild(sub);

        // Shutting down
        var txt = document.createElement('div');
        txt.style.cssText = 'font-family:FiraCode,monospace;font-size:0.75rem;color:#2AABEE;letter-spacing:0.4em;text-shadow:0 0 10px #2AABEE;transition:opacity 0.4s ease;';
        txt.textContent = 'SHUTTING DOWN...';
        outro.appendChild(txt);

        document.body.appendChild(outro);

        // Matrix rain
        var ctx = canvas.getContext('2d');
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        var cols  = Math.floor(canvas.width / 16);
        var drops = [];
        for (var i = 0; i < cols; i++) drops[i] = 1;
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*<>/\\|';
        var matrixTimer = setInterval(function() {
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#2AABEE';
            ctx.font = '14px monospace';
            for (var j = 0; j < drops.length; j++) {
                var ch = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(ch, j * 16, drops[j] * 16);
                if (drops[j] * 16 > canvas.height && Math.random() > 0.975) drops[j] = 0;
                drops[j]++;
            }
        }, 40);

        // Fade in
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { outro.style.opacity = '1'; });
        });

        // Удаляем название побуквенно через 500мс
        var word = 'TelegramBotnet';
        function deleteOut(i) {
            if (i < 0) { collapse(); return; }
            new Audio('/assets/audio/stdout.wav').play().catch(function(){});
            title.textContent = word.slice(0, i);
            setTimeout(function() { deleteOut(i - 1); }, 45);
        }
        setTimeout(function() { deleteOut(word.length); }, 500);

        function collapse() {
            logoSvg.style.transform = 'scaleY(0.04)';
            logoSvg.style.opacity   = '0';
            setTimeout(function() {
                sub.style.opacity = '0';
                txt.style.opacity = '0';
            }, 200);
            setTimeout(function() {
                clearInterval(matrixTimer);
                outro.style.transition = 'opacity 0.5s ease';
                outro.style.opacity = '0';
            }, 500);
            setTimeout(function() {
                if (window.pywebview) window.pywebview.api.exit_app();
            }, 1100);
        }
    }

    function init() {
        var btn = document.createElement('button');
        btn.textContent = '[ EXIT ]';
        btn.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;background:transparent;color:#ff3333;border:1px solid #ff3333;font-family:FiraCode,monospace;font-size:0.8rem;padding:0.4rem 0.9rem;cursor:pointer;letter-spacing:0.1em;';
        btn.onmouseover = function() { btn.style.background = '#ff3333'; btn.style.color = '#000'; };
        btn.onmouseout  = function() { btn.style.background = 'transparent'; btn.style.color = '#ff3333'; };
        btn.onclick = showExitDialog;
        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
