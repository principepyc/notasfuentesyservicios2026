(() => {
  'use strict';

  const DEFAULT_TITLE = 'OPAC Cátedra | Fuentes y Servicios de Información — ISFyCD FEB';
  const TOTAL_COMMISSIONS = 6;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const BASE_NUMBERS_ES = {
    1: 'Uno',
    2: 'Dos',
    3: 'Tres',
    4: 'Cuatro',
    5: 'Cinco',
    6: 'Seis',
    7: 'Siete',
    8: 'Ocho',
    9: 'Nueve',
    10: 'Diez',
  };

  // Referencias al DOM
  const vistaDirectorio = document.getElementById('vista-directorio');
  const vistaConsulta = document.getElementById('vista-consulta');
  const directorioTitulo = document.getElementById('directorio-titulo');
  const consultaTitulo = document.getElementById('consulta-titulo');
  const tituloComisionNum = document.getElementById('titulo-comision-num');
  const breadcrumbComision = document.getElementById('breadcrumb-comision');
  const terminalSalaBadge = document.getElementById('terminal-sala-badge');

  const opacForm = document.getElementById('opac-form');
  const dniInput = document.getElementById('dni-input');
  const dniError = document.getElementById('dni-error');
  const dniErrorText = document.getElementById('dni-error-text');
  const btnConsultar = document.getElementById('btn-consultar');
  const btnConsultarTexto = document.getElementById('btn-consultar-texto');

  const lookupFeedback = document.getElementById('lookup-feedback');
  const feedbackTitle = document.getElementById('feedback-title');
  const feedbackDetail = document.getElementById('feedback-detail');

  const demoBanner = document.getElementById('demo-banner');
  const demoHintsList = document.getElementById('demo-hints-list');

  const fichaResultado = document.getElementById('ficha-resultado');
  const fichaSignatura = document.getElementById('ficha-signatura');
  const fichaEstadoIconoVerificado = document.getElementById('ficha-icono-verificado');
  const fichaEstadoIconoPendiente = document.getElementById('ficha-icono-pendiente');
  const fichaEstadoTexto = document.getElementById('ficha-estado-texto');
  const fichaTitulo = document.getElementById('ficha-titulo');
  const fichaNotaEtiqueta = document.getElementById('ficha-nota-etiqueta');
  const fichaNota = document.getElementById('ficha-nota');
  const fichaNotaEscala = document.getElementById('ficha-nota-escala');
  const fichaNotaLetras = document.getElementById('ficha-nota-letras');
  const fichaNotaContexto = document.getElementById('ficha-nota-contexto');
  const fichaComision = document.getElementById('ficha-comision');
  const fichaEstudiante = document.getElementById('ficha-estudiante');
  const btnImprimir = document.getElementById('btn-imprimir');
  const btnNuevaConsulta = document.getElementById('btn-nueva-consulta');

  let activeComision = null;
  let isSearching = false;

  // Región aria-live única y centralizada para anuncios accesibles
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'visually-hidden';
  document.body.append(announcer);

  let announceTimer = null;
  function announcePolite(message, delayMs = 200) {
    window.clearTimeout(announceTimer);
    announcer.textContent = '';
    announceTimer = window.setTimeout(() => {
      announcer.textContent = message;
    }, delayMs);
  }

  function normalizeDni(raw) {
    return String(raw ?? '')
      .trim()
      .replace(/[\s.\-]/g, '')
      .toUpperCase();
  }

  function base64ToBytes(b64) {
    const binary = window.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function formatGradeDisplay(nota) {
    return String(nota).replace('.', ',');
  }

  function gradeToSpanishWords(nota) {
    const num = Number(nota);
    if (!Number.isFinite(num)) return '';
    const intPart = Math.trunc(num);
    const decPart = Math.round((num - intPart) * 100);
    const baseWord = BASE_NUMBERS_ES[intPart] || String(intPart);
    if (decPart === 0) return baseWord;
    if (decPart === 50) return `${baseWord} con cincuenta`;
    return `${baseWord} coma ${String(decPart).padStart(2, '0').replace(/0$/, '')}`;
  }

  // Validación personalizada del DNI sincronizada con :user-invalid y ARIA
  function updateCustomDniValidity() {
    const raw = dniInput.value.trim();
    if (!raw) {
      dniInput.setCustomValidity('');
      dniErrorText.textContent = 'Ingresá tu N.º de Documento (DNI) para continuar.';
      return;
    }
    if (/[^\d.\-\s]/.test(raw)) {
      const msg = 'Ingresá solo números (podés incluir puntos o guiones).';
      dniInput.setCustomValidity(msg);
      dniErrorText.textContent = msg;
      return;
    }
    if (normalizeDni(raw).length < 6) {
      const msg = 'Ingresá un DNI válido de al menos 6 dígitos.';
      dniInput.setCustomValidity(msg);
      dniErrorText.textContent = msg;
      return;
    }
    dniInput.setCustomValidity('');
  }

  const supportsUserInvalid = (() => {
    try {
      return CSS.supports('selector(:user-invalid)');
    } catch {
      return false;
    }
  })();

  const dirtyState = new WeakMap();

  function linkError(el, shown) {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  }

  function syncDniAria(announce = false, forceCheck = false) {
    updateCustomDniValidity();

    let isInvalid = false;
    if (supportsUserInvalid) {
      isInvalid = dniInput.matches(':user-invalid') || (forceCheck && !dniInput.validity.valid);
    } else {
      const state = dirtyState.get(dniInput);
      isInvalid = Boolean((state?.hasBlurred || forceCheck) && !dniInput.validity.valid);
      dniInput.classList.toggle('user-invalid-fallback', isInvalid);
    }

    dniInput.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
    dniError.hidden = !isInvalid;
    linkError(dniInput, isInvalid);

    if (isInvalid && announce) {
      announcePolite(`N.º de Documento (DNI): ${dniErrorText.textContent}`, 450);
    }
  }

  function resetFormValidationState() {
    dniInput.value = '';
    dniInput.setCustomValidity('');
    dirtyState.delete(dniInput);
    dniInput.classList.remove('user-invalid-fallback');
    dniInput.setAttribute('aria-invalid', 'false');
    dniError.hidden = true;
    linkError(dniInput, false);
  }

  function hideRecordAndFeedback() {
    fichaResultado.hidden = true;
    delete fichaResultado.dataset.recordState;
    fichaTitulo.textContent = 'APELLIDO, Nombre';
    fichaEstudiante.textContent = '';
    fichaNota.textContent = '–';
    fichaNotaEscala.hidden = false;
    fichaNotaLetras.textContent = '';
    lookupFeedback.hidden = true;
    lookupFeedback.setAttribute('role', 'alert');
    delete lookupFeedback.dataset.tone;
    feedbackDetail.textContent = '';
  }

  function renderDemoHints(bundle) {
    demoHintsList.textContent = '';
    if (!bundle?.isDemo || !Array.isArray(bundle.demoHints) || bundle.demoHints.length === 0) {
      demoBanner.hidden = true;
      demoBanner.open = false;
      return;
    }

    for (const hint of bundle.demoHints) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-chip-btn';
      btn.textContent = `${hint.dni} · ${hint.label}`;
      btn.addEventListener('click', () => {
        dniInput.value = hint.dni;
        dirtyState.set(dniInput, { hasInteracted: true, hasBlurred: false });
        syncDniAria(false);
        dniInput.focus();
      });
      li.append(btn);
      demoHintsList.append(li);
    }

    demoBanner.hidden = false;
  }

  function parseCommissionFromUrl() {
    const hash = window.location.hash.trim().toLowerCase();
    const hashMatch = hash.match(/^#comision[-_]?([1-6])$/);
    if (hashMatch) return Number(hashMatch[1]);

    const params = new URLSearchParams(window.location.search);
    const queryCom = params.get('comision');
    if (queryCom && /^[1-6]$/.test(queryCom.trim())) {
      return Number(queryCom.trim());
    }
    return null;
  }

  function updateDirectoryBadges() {
    const catalog = window.OPAC_CATALOGO || {};
    for (let i = 1; i <= TOTAL_COMMISSIONS; i += 1) {
      const badge = document.querySelector(`[data-count-comision="${i}"]`);
      if (!badge) continue;
      const bundle = catalog[String(i)];
      if (!bundle || !Array.isArray(bundle.records) || bundle.records.length === 0) {
        badge.textContent = 'En preparación';
      } else if (bundle.isDemo) {
        badge.textContent = 'Modo demostración';
      } else {
        badge.textContent = 'Catálogo activo';
      }
    }
  }

  function showDirectoryView(shouldFocus = false) {
    activeComision = null;
    hideRecordAndFeedback();
    resetFormValidationState();
    updateDirectoryBadges();

    vistaConsulta.hidden = true;
    vistaDirectorio.hidden = false;
    document.title = DEFAULT_TITLE;

    if (shouldFocus) {
      directorioTitulo.focus();
    }
  }

  function showCommissionView(comisionNum, shouldFocus = false) {
    activeComision = comisionNum;
    hideRecordAndFeedback();
    resetFormValidationState();

    const padNum = String(comisionNum).padStart(2, '0');
    const comisionLabel = `Comisión ${comisionNum}`;

    breadcrumbComision.textContent = comisionLabel;
    terminalSalaBadge.textContent = `SIGNATURA · COMISIÓN ${padNum}`;
    tituloComisionNum.textContent = comisionLabel;
    fichaSignatura.textContent = `SIGNATURA: FyS-2026 · COM-${padNum}`;
    fichaComision.textContent = `${comisionLabel} — Ciclo Lectivo 2026`;

    const bundle = window.OPAC_CATALOGO?.[String(comisionNum)];
    renderDemoHints(bundle);

    if (!bundle || !Array.isArray(bundle.records) || bundle.records.length === 0) {
      lookupFeedback.setAttribute('role', 'status');
      lookupFeedback.dataset.tone = 'info';
      feedbackTitle.textContent = 'Calificaciones aún en carga';
      feedbackDetail.textContent = `Todavía no se publicaron los registros cifrados de la ${comisionLabel}. Volvé a consultar próximamente.`;
      lookupFeedback.hidden = false;
    }

    vistaDirectorio.hidden = true;
    vistaConsulta.hidden = false;
    document.title = `${comisionLabel} | OPAC Fuentes y Servicios de Información — ISFyCD FEB`;

    if (shouldFocus) {
      consultaTitulo.focus();
    }
  }

  function syncRoute(shouldFocus = false) {
    const comisionNum = parseCommissionFromUrl();
    if (comisionNum) {
      showCommissionView(comisionNum, shouldFocus);
    } else {
      showDirectoryView(shouldFocus);
    }
  }

  async function lookupAndDecrypt(comisionNum, dniNormalized) {
    const bundle = window.OPAC_CATALOGO?.[String(comisionNum)];
    if (!bundle || !Array.isArray(bundle.records)) {
      throw new Error('NO_BUNDLE');
    }
    if (bundle.records.length === 0) {
      throw new Error('EMPTY_BUNDLE');
    }

    if (!window.crypto?.subtle) {
      throw new Error('NO_WEBCRYPTO');
    }

    const saltBytes = base64ToBytes(bundle.salt);
    const secretMaterial = encoder.encode(`c${comisionNum}:${dniNormalized}`);

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      secretMaterial,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: bundle.iterations,
        hash: 'SHA-256',
      },
      baseKey,
      512
    );

    const derivedBytes = new Uint8Array(derivedBits);
    const tokenSeed = derivedBytes.slice(0, 32);
    const aesKeyBytes = derivedBytes.slice(32, 64);

    const tokenHashBuffer = await window.crypto.subtle.digest('SHA-256', tokenSeed);
    const lookupToken = bytesToHex(new Uint8Array(tokenHashBuffer));

    const match = bundle.records.find((rec) => rec.t === lookupToken);
    if (!match) {
      return null;
    }

    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      aesKeyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = base64ToBytes(match.i);
    const ciphertext = base64ToBytes(match.d);
    const aad = encoder.encode(`isfycd-fys-2026-c${comisionNum}`);

    const plaintextBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      aesKey,
      ciphertext
    );

    const jsonStr = decoder.decode(plaintextBuffer).trim();
    return JSON.parse(jsonStr);
  }

  function renderRecord(comisionNum, studentData) {
    const fullCatalogName = `${String(studentData.a).toUpperCase()}, ${studentData.n}`;
    const isPending = studentData.g === null || studentData.g === undefined;

    fichaTitulo.textContent = fullCatalogName;
    fichaEstudiante.textContent = fullCatalogName;

    if (isPending) {
      fichaResultado.dataset.recordState = 'pending';
      fichaEstadoIconoVerificado.hidden = true;
      fichaEstadoIconoPendiente.hidden = false;
      fichaEstadoTexto.textContent = 'Corrección en curso';
      fichaNotaEtiqueta.textContent = 'Estado actual';
      fichaNota.textContent = 'Pendiente';
      fichaNotaEscala.hidden = true;
      fichaNotaLetras.textContent = 'Sin nota final asignada aún';
      fichaNotaContexto.textContent =
        'Tu evaluación final todavía está pendiente porque aguardamos la corrección de tu trabajo. ' +
        'Una vez corregido, actualizaremos tu calificación definitiva en este catálogo.';
    } else {
      const gradeText = formatGradeDisplay(studentData.g);
      const gradeWords = gradeToSpanishWords(studentData.g);
      delete fichaResultado.dataset.recordState;
      fichaEstadoIconoVerificado.hidden = false;
      fichaEstadoIconoPendiente.hidden = true;
      fichaEstadoTexto.textContent = 'Registro verificado';
      fichaNotaEtiqueta.textContent = 'Nota final';
      fichaNota.textContent = gradeText;
      fichaNotaEscala.hidden = false;
      fichaNotaLetras.textContent = gradeWords;
      fichaNotaContexto.textContent =
        'Calificación numérica definitiva correspondiente al cierre de cursada 2026 en la unidad curricular ' +
        'Fuentes y Servicios de Información.';
    }

    lookupFeedback.hidden = true;
    fichaResultado.hidden = false;

    document.title = `Ficha de ${studentData.a} — Comisión ${comisionNum} | OPAC FyS`;
    if (isPending) {
      announcePolite(`Ficha encontrada para ${studentData.n} ${studentData.a}. Estado: pendiente de corrección.`);
    } else {
      announcePolite(`Ficha encontrada para ${studentData.n} ${studentData.a}. Nota final: ${formatGradeDisplay(studentData.g)} sobre 10.`);
    }
    fichaTitulo.focus();
  }

  function setBusyState(busy) {
    isSearching = busy;
    btnConsultar.disabled = busy;
    btnConsultar.setAttribute('aria-busy', busy ? 'true' : 'false');
    btnConsultarTexto.textContent = busy ? 'Consultando catálogo…' : 'Consultar ficha';
  }

  // Eventos del formulario de consulta
  dniInput.addEventListener('blur', () => {
    const state = dirtyState.get(dniInput) || { hasInteracted: false, hasBlurred: false };
    state.hasBlurred = true;
    dirtyState.set(dniInput, state);
    if (state.hasInteracted || dniInput.value.trim() !== '') {
      syncDniAria(true);
    }
  });

  dniInput.addEventListener('input', () => {
    const state = dirtyState.get(dniInput) || { hasInteracted: false, hasBlurred: false };
    state.hasInteracted = true;
    dirtyState.set(dniInput, state);

    updateCustomDniValidity();
    if (dniInput.getAttribute('aria-invalid') === 'true') {
      syncDniAria(false);
    }
  });

  opacForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSearching || !activeComision) return;

    dirtyState.set(dniInput, { hasInteracted: true, hasBlurred: true });
    syncDniAria(false, true);

    if (!dniInput.validity.valid) {
      dniInput.focus();
      return;
    }

    const dniNormalized = normalizeDni(dniInput.value);
    hideRecordAndFeedback();
    setBusyState(true);

    try {
      const studentData = await lookupAndDecrypt(activeComision, dniNormalized);
      if (!studentData) {
        feedbackTitle.textContent = `Sin coincidencias en la Comisión ${activeComision}`;
        feedbackDetail.textContent =
          `No encontramos un registro asociado a ese DNI en la Comisión ${activeComision}. ` +
          `Verificá los números ingresados y confirmá que estés consultando el enlace correspondiente a tu comisión.`;
        lookupFeedback.hidden = false;
        announcePolite(feedbackTitle.textContent);
      } else {
        renderRecord(activeComision, studentData);
      }
    } catch (err) {
      if (err?.message === 'EMPTY_BUNDLE') {
        lookupFeedback.setAttribute('role', 'status');
        lookupFeedback.dataset.tone = 'info';
        feedbackTitle.textContent = 'Calificaciones aún en carga';
        feedbackDetail.textContent =
          `Todavía no se publicaron los registros cifrados de la Comisión ${activeComision}. Volvé a consultar próximamente.`;
      } else if (err?.message === 'NO_WEBCRYPTO') {
        feedbackTitle.textContent = 'Navegador no compatible o conexión insegura';
        feedbackDetail.textContent =
          'La desencriptación local requiere HTTPS o un navegador moderno con Web Crypto API habilitada.';
      } else if (err?.message === 'NO_BUNDLE') {
        feedbackTitle.textContent = 'Catálogo no disponible';
        feedbackDetail.textContent =
          `No hay datos cargados actualmente para la Comisión ${activeComision}.`;
      } else {
        feedbackTitle.textContent = 'No se pudo leer el registro';
        feedbackDetail.textContent =
          'Ocurrió un inconveniente al verificar el documento ingresado. Intentá nuevamente.';
      }
      lookupFeedback.hidden = false;
    } finally {
      setBusyState(false);
    }
  });

  btnImprimir.addEventListener('click', () => {
    window.print();
  });

  btnNuevaConsulta.addEventListener('click', () => {
    hideRecordAndFeedback();
    resetFormValidationState();
    if (activeComision) {
      document.title = `Comisión ${activeComision} | OPAC Fuentes y Servicios de Información — ISFyCD FEB`;
    }
    dniInput.focus();
  });

  // Skip link sin alterar el hash #comision1..6
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (activeComision) {
        consultaTitulo.focus();
      } else {
        directorioTitulo.focus();
      }
    });
  }

  // Botones de copiar enlace en el directorio de comisiones
  document.querySelectorAll('[data-copy-comision]').forEach((btn) => {
    const originalNodes = Array.from(btn.childNodes);
    let resetTimer = null;

    btn.addEventListener('click', async () => {
      const num = btn.getAttribute('data-copy-comision');
      const targetUrl = new URL(`#comision${num}`, window.location.href).href;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(targetUrl);
          btn.textContent = '¡Enlace copiado!';
          announcePolite(`Enlace directo de la Comisión ${num} copiado al portapapeles.`);
        } else {
          window.location.hash = `comision${num}`;
          announcePolite(`Comisión ${num} seleccionada. Copiá la dirección desde la barra del navegador.`);
          return;
        }
      } catch {
        window.location.hash = `comision${num}`;
        announcePolite(`Comisión ${num} abierta. Copiá la dirección desde la barra del navegador.`);
        return;
      }

      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        btn.replaceChildren(...originalNodes);
      }, 2200);
    });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#contenido-principal') return;
    syncRoute(true);
  });

  // Respaldo para navegadores sin sibling-index() en la cascada inicial del directorio
  const commissionList = document.getElementById('lista-comisiones');
  if (commissionList && !CSS.supports('animation-delay: calc(sibling-index() * 0.1s)')) {
    [...commissionList.children].forEach((el, index) => {
      el.style.setProperty('--sibling-index', String(index + 1));
    });
  }

  // Inicialización inicial
  syncRoute(false);
})();
