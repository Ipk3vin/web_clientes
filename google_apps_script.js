// ======================================================================
// CÓDIGO GOOGLE APPS SCRIPT PARA PEGAR EN GOOGLE SHEETS
// ======================================================================

function doGet(e) { return procesarDatos(e); }
function doPost(e) { return procesarDatos(e); }

function procesarDatos(e) {
  // Evitar error al darle "Ejecutar" por accidente en el editor
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("Esperando datos desde la página web...").setMimeType(ContentService.MimeType.TEXT);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Variables que nos envía el formulario
  var numeroCliente = e.parameter.numeroCliente || "Vacío";
  var correo = e.parameter.correo || "Vacío";
  var contrasena = e.parameter.contrasena || "Vacío";
  var tipoUsuario = e.parameter.tipoUsuario || "";
  var tipoCuenta = e.parameter.tipoCuenta || "";

  // Guardaremos la fecha oficial como objeto de fecha nativo de Google Sheets
  var fechaIngreso = new Date();

  // Orden exacto sin la fórmula aún: A(número), B(correo), C(contraseña), D(tipoUsuario), E(tipoCuenta), F(fecha)
  sheet.appendRow([numeroCliente, correo, contrasena, tipoUsuario, tipoCuenta, fechaIngreso]);

  // Inyectamos la fórmula especial de R1C1 en la columna G (la 7)
  // Al usar setFormulaR1C1, Google lo traducirá solo a tu idioma (Español) evitando el #ERROR!
  var ultimaFila = sheet.getLastRow();
  var formulaExcel = '=IF(ISBLANK(RC[-1]), "", MAX(0, 30 - (TODAY() - INT(RC[-1]))) & " días restantes")';
  sheet.getRange(ultimaFila, 7).setFormulaR1C1(formulaExcel);

  // Permitir respuesta para evitar errores CORS al final del proceso
  return ContentService.createTextOutput("Éxito").setMimeType(ContentService.MimeType.TEXT);
}

// ======================================================================
// 🤖 SISTEMA DE NOTIFICACIONES IA (TELEGRAM)
// ======================================================================
// Las credenciales se leen desde las "Propiedades del Script" de Google (Project Settings)
// Así el código es seguro para subir a GitHub sin exponer tokens.
const TELEGRAM_TOKEN = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
const MI_CHAT_ID = PropertiesService.getScriptProperties().getProperty('MI_CHAT_ID');

// Esta función es la que el "Activador" de Google ejecutará 1 vez al día de forma automática
function revisarVencimientosDiarios() {

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const hoy = new Date();

  // Revisamos fila por fila
  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    const numeroCliente = fila[0]; // Columna A
    const correo = fila[1];        // Columna B
    const contrasena = fila[2];    // Columna C
    const tipoUsuario = fila[3];   // Columna D
    const tipoCuenta = fila[4];    // Columna E
    const fechaIngreso = fila[5];  // Columna F (Fechas originales)

    // Validamos que exista una fecha válida en esa fila
    if (!fechaIngreso || Object.prototype.toString.call(fechaIngreso) !== "[object Date]") {
      continue;
    }

    // Calculamos días pasados matemáticamente
    const diferenciaMs = hoy.getTime() - fechaIngreso.getTime();
    const diasPasados = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));

    // ALERTAS: Avisa TEMPORALMENTE a todos los que tengan menos de 30 días para pruebas
    if (diasPasados <= 30) {

      const restantes = 30 - diasPasados;
      const estado = (restantes === 0) ? "❌ *HA VENCIDO HOY*" : `🧪 *PRUEBA: VENCE EN ${restantes} DÍAS*`;

      const mensajeAviso = `${estado}\n\n` +
        `👤 *Usuario:* ${correo || 'No indicado'}\n` +
        `🔑 *Clave:* ${contrasena}\n` +
        `📦 *Cuenta:* ${tipoCuenta || 'No indicado'}\n` +
        `📝 *Días transcurridos:* ${diasPasados}/30\n\n` +
        `¿Deseas avisarle al usuario por WhatsApp? 👇`;

      // El mensaje que se auto-escribirá en WhatsApp para enviárselo al usuario
      const urgenciaMSG = (restantes === 0) ? `vence el día de hoy.` : `está por vencer en ${restantes} días.`;
      const mensajeUsuario = `¡Hola! 👋 Te escribo para recordarte los detalles de tu cuenta:\n\n` +
        `👤 Usuario: ${correo || 'Tu correo registrado'}\n` +
        `🔑 Clave: ${contrasena}\n\n` +
        `Te informamos que tu mes exacto de servicio ${urgenciaMSG}\n` +
        `¿Deseas realizar la renovación para no perder el acceso? ✨`;

      // Limpiamos los espacios y los `+` del teléfono para que el Link de Wa.me no se rompa
      const telefonoLimpio = String(numeroCliente).replace(/[^0-9]/g, '');
      const waLink = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensajeUsuario)}`;

      // Llamamos a la función que conecta a Telegram
      enviarNotificacionTelegram(mensajeAviso, waLink);
    }
  }
}

// Función interna que habla directamente con los servidores de Telegram
function enviarNotificacionTelegram(textoAlerta, enlaceBotonWa) {
  const urlApi = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const payload = {
    chat_id: MI_CHAT_ID,
    text: textoAlerta,
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [[
        { text: "📲 Abrir Chat y Enviar Aviso", url: enlaceBotonWa }
      ]]
    })
  };

  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch(urlApi, options);
  } catch (e) {
    Logger.log("Hubo un error contactando a Telegram: " + e);
  }
}


