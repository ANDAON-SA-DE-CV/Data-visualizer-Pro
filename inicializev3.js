function(instance, properties, context) {
  console.log("[ChartElement] Inicializando elemento...");

  // Función de utilidad buildChartConfigs
  function buildChartConfigs(props = {}) {
    if (Array.isArray(props.chart_configs) && props.chart_configs.length) {
      return props.chart_configs;            // retro-compatibilidad
    }

    const ids         = (props.chart_ids         || '').split(',');
    const titles      = (props.chart_titles      || '').split(',');
    const types       = (props.chart_types       || '').split(',');
    const positions   = (props.chart_positions   || '').split(',');
    const xFields     = (props.chart_xfields     || '').split(',');
    const yFields     = (props.chart_yfields     || '').split(',');
    const nameFields  = (props.chart_namefields  || '').split(',');
    const valueFields = (props.chart_valuefields || '').split(',');
    const exportables = (props.chart_exportable  || '').split(',');

    const len = Math.min(
      ids.length, titles.length, types.length, positions.length,
      xFields.length, yFields.length, nameFields.length,
      valueFields.length, exportables.length
    );
    if (len === 0 || !ids[0]) return [];

    if ([ids, titles, types, positions, xFields, yFields,
         nameFields, valueFields, exportables].some(a => a.length !== len)) {
      console.warn('[DVP] buildChartConfigs: longitudes desiguales; se trunca a', len);
    }

    const out = [];
    for (let i = 0; i < len; i++) {
      if (!ids[i]) continue;

      const [r = 1, c = 1, rs = 1, cs = 1] = positions[i].split(':').map(n => parseInt(n || 1,10));

      const rawType  = (types[i] || 'bar').trim().toLowerCase();
      const typeSafe = ['bar','line','pie','donut'].includes(rawType) ? rawType : 'bar';

      out.push({
        id        : ids[i].trim(),
        title     : titles[i] ? titles[i].trim() : `Gráfico ${i+1}`,
        type      : typeSafe,
        position  : {row:r, col:c, rowSpan:rs, colSpan:cs},
        exportable: exportables[i].trim() === 'true',
        ...(typeSafe === 'pie' || typeSafe === 'donut'
            ? { name_field : nameFields[i].trim()  || 'category',
                value_field: valueFields[i].trim() || 'value' }
            : { x_field : xFields[i].trim() || 'category',
                y_fields: (yFields[i] || '').split('|').filter(Boolean).length
                          ? (yFields[i]).split('|').filter(Boolean)
                          : ['value'] })
      });
    }
    return out;
  }
    // Alias input_data - NUEVO
  properties.data_source = (properties.input_data && properties.input_data.length)
                         ? properties.input_data
                         : properties.data_source;
    /* 
  chart_ids = "sales_bar,profit_line"
  chart_titles = "Ventas,Utilidad"
  chart_types = "bar,line"
  chart_positions = "1:1:1:1,1:2:1:1"
  chart_xfields = "month,month"
  chart_yfields = "sales|cost,profit"
  chart_namefields = ","
  chart_valuefields = ","
  chart_exportable = "true,false"
  input_data = [ {month:"Jan",sales:100,cost:70,profit:30}, … ]
  */

  // Crear ID único para el contenedor
  const uniqueId = "chart-container-" + (new Date().getTime());
  const container = document.createElement("div");
  container.id = uniqueId;
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.minHeight = "300px";
  container.style.position = "relative"; // Para posicionar el botón de exportación

  // Agregar contenedor al canvas
  let canvasElement = null;
  if (instance.canvas && instance.canvas.jquery) {
    canvasElement = instance.canvas.get(0);
  } else if (Array.isArray(instance.canvas) && instance.canvas.length > 0) {
    canvasElement = instance.canvas[0];
  } else if (instance.canvas instanceof Element) {
    canvasElement = instance.canvas;
  }

  if (canvasElement && typeof canvasElement.appendChild === "function") {
    canvasElement.appendChild(container);
    console.log("[ChartElement] Contenedor agregado correctamente.");
  } else {
    console.error("[ChartElement] ERROR: canvasElement no válido.");
    return;
  }

  // Almacenar referencias en la instancia
  instance.data.container = container;
  instance.data.container_id = uniqueId;
  
  // Sistema de caché para optimizar rendimiento
  instance.data.cache = {
    inputHash: "",
    result: null
  };
  
  // Gestión de localización de Plotly
  instance.data.loadedLocales = new Set(["en"]);  // Inglés siempre está cargado por defecto
  
  // Función para cargar locale de Plotly
  instance.data.loadPlotlyLocale = function(lang) {
    return new Promise((resolve, reject) => {
      // Si es auto-detectar, obtener idioma del navegador
      if (lang === 'auto') {
        const browserLang = navigator.language || navigator.userLanguage;
        lang = browserLang.split('-')[0];
      }
      
      // Si ya está cargado o es inglés (default), resolver inmediatamente
      if (instance.data.loadedLocales.has(lang) || lang === 'en') {
        resolve(lang);
        return;
      }
      
      // Cargar el script del locale
      const script = document.createElement('script');
      script.src = `https://cdn.plot.ly/plotly-locale-${lang}-latest.js`;
      script.onload = () => {
        console.log(`[ChartElement] ✅ Locale ${lang} cargado correctamente.`);
        instance.data.loadedLocales.add(lang);
        resolve(lang);
      };
      script.onerror = () => {
        console.warn(`[ChartElement] ⚠️ No se pudo cargar locale ${lang}, usando 'en'.`);
        resolve('en');
      };
      
      document.head.appendChild(script);
    });
  };
  
  // Sistema de localización para estados visuales
  instance.data.locales = {
    "es": {
      loading: "Cargando...",
      noData: "No hay datos para mostrar",
      error: "No se pudo generar el gráfico",
      export: "Exportar",
      exportingData: "Exportando datos...",
      csv: "CSV (.csv)",
      excel: "Excel (.xlsx)",
      pdf: "PDF (.pdf)",
      image: "Imagen (.png)",
      json: "JSON (.json)",
      errorExporting: "Error al exportar. Intente nuevamente.",
      addChart: "Añadir gráfico",
      removeChart: "Eliminar",
      configureChart: "Configurar",
      chartSettings: "Ajustes del gráfico",
      applyChanges: "Aplicar cambios",
      cancel: "Cancelar",
      chartType: "Tipo de gráfico",
      position: "Posición",
      columnSpan: "Ancho (columnas)",
      rowSpan: "Alto (filas)"
    },
    "en": {
      loading: "Loading...",
      noData: "No data to display",
      error: "Could not generate chart",
      export: "Export",
      exportingData: "Exporting data...",
      csv: "CSV (.csv)",
      excel: "Excel (.xlsx)",
      pdf: "PDF (.pdf)",
      image: "Image (.png)",
      json: "JSON (.json)",
      errorExporting: "Error exporting data. Please try again.",
      addChart: "Add chart",
      removeChart: "Remove",
      configureChart: "Configure",
      chartSettings: "Chart settings",
      applyChanges: "Apply changes",
      cancel: "Cancel",
      chartType: "Chart type",
      position: "Position",
      columnSpan: "Width (columns)",
      rowSpan: "Height (rows)"
    },
    "fr": {
      loading: "Chargement...",
      noData: "Pas de données à afficher",
      error: "Impossible de générer le graphique",
      export: "Exporter",
      exportingData: "Exportation de données...",
      csv: "CSV (.csv)",
      excel: "Excel (.xlsx)",
      pdf: "PDF (.pdf)",
      image: "Image (.png)",
      json: "JSON (.json)",
      errorExporting: "Erreur lors de l'exportation. Veuillez réessayer.",
      addChart: "Ajouter un graphique",
      removeChart: "Supprimer",
      configureChart: "Configurer",
      chartSettings: "Paramètres du graphique",
      applyChanges: "Appliquer",
      cancel: "Annuler",
      chartType: "Type de graphique",
      position: "Position",
      columnSpan: "Largeur (colonnes)",
      rowSpan: "Hauteur (lignes)"
    },
    // Añadir más idiomas si es necesario
  };
  
  // Función para obtener locale para estados visuales
  instance.data.getLocale = function(lang) {
    if (lang === 'auto') {
      const browserLang = navigator.language || navigator.userLanguage;
      lang = browserLang.split('-')[0];
    }
    
    return instance.data.locales[lang] || instance.data.locales["en"];
  };
  
  // Función utilitaria para formatear fechas para nombres de archivo
  instance.data.formatDate = function(date = new Date()) {
    const pad = (num) => String(num).padStart(2, '0');
    
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };
  
  // Función para preparar los datos para exportación desde internal data
  instance.data.extractPlotlyData = function() {
    console.log("[ChartElement] 🔍 Extrayendo datos directamente de Plotly");
    
    try {
      // Obtener el contenedor del gráfico
      const container = document.getElementById(instance.data.container_id);
      if (!container) {
        console.warn("[ChartElement] ⚠️ No se encontró el contenedor del gráfico");
        return [];
      }
      
      // Acceder a los datos internos de Plotly (datos reales renderizados)
      const plotlyDiv = container;
      if (!plotlyDiv._fullData && !plotlyDiv.data) {
        console.warn("[ChartElement] ⚠️ No se encontraron datos de Plotly en el contenedor");
        return [];
      }
      
      // Usar los datos reales del gráfico renderizado
      const plotlyData = plotlyDiv._fullData || plotlyDiv.data;
      console.log("[ChartElement] 🔍 Datos internos de Plotly:", plotlyData);
      
      if (!plotlyData || !Array.isArray(plotlyData) || plotlyData.length === 0) {
        console.warn("[ChartElement] ⚠️ No hay trazas en los datos de Plotly");
        return [];
      }
      
      // Extraer datos según el tipo de gráfico
      const chartType = instance.data.currentChartType || "bar";
      let extractedData = [];
      
      // Determinar el tipo de gráfico real renderizado
      let effectiveType = chartType.toLowerCase();
      if (plotlyData[0].type) {
        effectiveType = plotlyData[0].type.toLowerCase();
        console.log("[ChartElement] 🔍 Tipo real del gráfico:", effectiveType);
      }
      
      switch (effectiveType) {
        case "bar":
        case "scatter": // Incluye line y scatter
          // Extraer datos de gráficos de barras, líneas o puntos (más común)
          // Suponemos que cada trace tiene x, y, y name (serie)
          
          // Obtener todas las categorías únicas (eje X)
          const allCategories = new Set();
          plotlyData.forEach(trace => {
            if (trace.x && Array.isArray(trace.x)) {
              trace.x.forEach(x => allCategories.add(x));
            }
          });
          
          const categories = Array.from(allCategories);
          console.log("[ChartElement] 🔍 Categorías únicas:", categories);
          
          // Para cada categoría, crear una fila con valores de cada serie
          categories.forEach(category => {
            const row = { categoria: category };
            
            plotlyData.forEach(trace => {
              const serieName = trace.name || "Serie";
              
              // Encontrar el índice de esta categoría en la traza
              if (trace.x && trace.y && Array.isArray(trace.x) && Array.isArray(trace.y)) {
                const idx = trace.x.indexOf(category);
                row[serieName] = idx !== -1 && idx < trace.y.length ? trace.y[idx] : null;
              }
            });
            
            extractedData.push(row);
          });
          break;
          
        case "pie":
        case "donut": 
          // Extraer datos de gráficos de tipo pie
          if (plotlyData[0].labels && plotlyData[0].values) {
            plotlyData[0].labels.forEach((label, i) => {
              extractedData.push({
                categoria: label,
                valor: plotlyData[0].values[i]
              });
            });
          }
          break;
          
        case "heatmap":
        case "contour":
          // Extraer datos de heatmaps y contours
          if (plotlyData[0].x && plotlyData[0].y && plotlyData[0].z) {
            // Para cada coordenada (x,y), añadir el valor z correspondiente
            plotlyData[0].y.forEach((yValue, yIdx) => {
              plotlyData[0].x.forEach((xValue, xIdx) => {
                const zMatrix = plotlyData[0].z;
                const zValue = zMatrix && zMatrix[yIdx] ? zMatrix[yIdx][xIdx] : null;
                
                extractedData.push({
                  x: xValue,
                  y: yValue,
                  valor: zValue
                });
              });
            });
          }
          break;
          
        case "ohlc":
        case "candlestick":
          // Extraer datos financieros
          if (plotlyData[0].x && plotlyData[0].open && plotlyData[0].high && 
              plotlyData[0].low && plotlyData[0].close) {
            plotlyData[0].x.forEach((date, i) => {
              extractedData.push({
                fecha: date,
                apertura: plotlyData[0].open[i],
                maximo: plotlyData[0].high[i],
                minimo: plotlyData[0].low[i],
                cierre: plotlyData[0].close[i]
              });
            });
          }
          break;
          
        default:
          // Para otros tipos, extraer de manera genérica
          console.log("[ChartElement] 🔍 Extrayendo datos de tipo no específico:", effectiveType);
          
          // Intentar extraer como si fuera un gráfico común
          const firstTrace = plotlyData[0];
          
          // Determinar las propiedades que contienen arrays (posibles datos)
          const arrayProps = Object.keys(firstTrace).filter(key => 
            Array.isArray(firstTrace[key]) && firstTrace[key].length > 0
          );
          
          console.log("[ChartElement] 🔍 Propiedades con arrays:", arrayProps);
          
          // Si tenemos propiedades con arrays, usarlas para construir datos
          if (arrayProps.length > 0) {
            // Usar la primera propiedad como referencia para la longitud
            const refProp = arrayProps[0];
            const dataLength = firstTrace[refProp].length;
            
            // Para cada índice, crear un objeto con los valores
            for (let i = 0; i < dataLength; i++) {
              const item = {};
              
              // Añadir valores de todas las trazas (series)
              plotlyData.forEach((trace, traceIndex) => {
                const serieName = trace.name || `Serie ${traceIndex + 1}`;
                
                // Añadir valores de todas las propiedades que son arrays
                arrayProps.forEach(prop => {
                  if (Array.isArray(trace[prop]) && i < trace[prop].length) {
                    // Usar el nombre de la serie como prefijo solo si hay múltiples trazas
                    const keyName = plotlyData.length > 1 ? 
                      `${serieName}_${prop}` : prop;
                    
                    item[keyName] = trace[prop][i];
                  }
                });
              });
              
              extractedData.push(item);
            }
          }
          
          // Si no se pudieron extraer datos, crear entradas por traza
          if (extractedData.length === 0) {
            plotlyData.forEach((trace, index) => {
              const entry = { 
                traza: trace.name || `Serie ${index + 1}`,
                tipo: trace.type || effectiveType
              };
              
              // Añadir propiedades simples
              Object.keys(trace).forEach(key => {
                if (typeof trace[key] !== 'object' && key !== 'name' && key !== 'type') {
                  entry[key] = trace[key];
                }
              });
              
              extractedData.push(entry);
            });
          }
      }
      
      console.log("[ChartElement] ✅ Datos extraídos de Plotly:", extractedData);
      
      // Si después de todo, no hay datos, crear datos de ejemplo
      if (extractedData.length === 0) {
        console.warn("[ChartElement] ⚠️ No se pudieron extraer datos. Generando datos de ejemplo");
        extractedData = [
          {
            region: "Región 1", 
            valor: 100, 
            nota: "Datos de ejemplo generados al no encontrar datos reales"
          },
          {
            region: "Región 2", 
            valor: 200,
            nota: "Datos de ejemplo generados al no encontrar datos reales"
          }
        ];
      }
      
      return extractedData;
    } catch (error) {
      console.error("[ChartElement] ❌ Error extrayendo datos de Plotly:", error);
      
      // Devolver un array con información del error
      return [{
        error: "Error extrayendo datos",
        mensaje: error.message,
        fecha: new Date().toISOString()
      }];
    }
  };
  
  // Función para validar y verificar imágenes
  instance.data.validateAndFetchImage = function(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error("URL vacía"));
        return;
      }
      
      // Verificar si es una URL válida
      let validUrl;
      try {
        validUrl = new URL(url);
      } catch (e) {
        reject(new Error(`URL inválida: ${url}`));
        return;
      }
      
      // Intentar cargar la imagen
      const img = new Image();
      img.crossOrigin = "anonymous"; // Importante para CORS
      
      img.onload = () => {
        console.log(`[ChartElement] ✅ Imagen cargada correctamente: ${url} (${img.width}x${img.height})`);
        resolve({
          url,
          width: img.width,
          height: img.height,
          valid: true
        });
      };
      
      img.onerror = () => {
        console.error(`[ChartElement] ❌ Error cargando imagen: ${url}`);
        reject(new Error(`No se pudo cargar la imagen: ${url}`));
      };
      
      img.src = url;
    });
  };
  
  // Función para aplicar estilos al botón de exportación
  instance.data.applyExportButtonStyles = function(button, properties) {
    console.log("[ChartElement] 🔍 Aplicando estilos al botón de exportación:", properties);
    
    if (!button) {
      console.warn("[ChartElement] ⚠️ No se encontró el botón de exportación");
      return;
    }
    
    // Aplicar color de fondo
    if (properties.buttonColor) {
      button.style.backgroundColor = properties.buttonColor;
      console.log(`[ChartElement] ✅ Color de botón aplicado: ${properties.buttonColor}`);
    }
    
    // Aplicar color de texto
    if (properties.textColor) {
      button.style.color = properties.textColor;
      console.log(`[ChartElement] ✅ Color de texto aplicado: ${properties.textColor}`);
    }
    
    // Aplicar texto personalizado
    if (properties.buttonText) {
      const textElement = button.querySelector(".export-text");
      if (textElement) {
        textElement.textContent = properties.buttonText;
        console.log(`[ChartElement] ✅ Texto de botón aplicado: ${properties.buttonText}`);
      }
    }
    
    // Aplicar icono personalizado
    if (properties.buttonIcon) {
      const iconElement = button.querySelector(".export-icon");
      if (iconElement) {
        iconElement.textContent = properties.buttonIcon;
        console.log(`[ChartElement] ✅ Icono de botón aplicado: ${properties.buttonIcon}`);
      }
    }
  };
  
  // Cargar librerías necesarias para exportación
  instance.data.loadExportLibraries = function() {
    return new Promise((resolve, reject) => {
      // Verificar si ya están cargadas las bibliotecas mínimas necesarias
      if (
        window.XLSX && 
        window.jspdf && 
        window.html2canvas && 
        window._
      ) {
        console.log("[ChartElement] ✅ Bibliotecas mínimas ya están cargadas");
        resolve();
        return;
      }
      
      // URLs de las librerías (sin moment.js)
      const libraries = {
        sheetjs: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        lodash: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js'
      };
      
      // Array para llevar el registro de las bibliotecas que necesitan cargarse
      const requiredLibraries = [];
      
      // Verificar qué bibliotecas faltan
      if (!window.XLSX) requiredLibraries.push(libraries.sheetjs);
      if (!window.jspdf) requiredLibraries.push(libraries.jspdf);
      if (!window.html2canvas) requiredLibraries.push(libraries.html2canvas);
      if (!window._) requiredLibraries.push(libraries.lodash);
      
      console.log(`[ChartElement] 🔄 Cargando ${requiredLibraries.length} bibliotecas...`);
      
      // Si no hay bibliotecas que cargar, resolver inmediatamente
      if (requiredLibraries.length === 0) {
        resolve();
        return;
      }
      
      // Función para cargar un script
      const loadScript = (url) => {
        return new Promise((resolve, reject) => {
          console.log(`[ChartElement] 🔄 Cargando: ${url}`);
          const script = document.createElement('script');
          script.src = url;
          script.async = true;
          script.onload = () => {
            console.log(`[ChartElement] ✅ Cargada: ${url}`);
            resolve();
          };
          script.onerror = () => {
            console.error(`[ChartElement] ❌ Error cargando: ${url}`);
            reject(new Error(`No se pudo cargar: ${url}`));
          };
          document.head.appendChild(script);
        });
      };
      
      // Cargar todas las bibliotecas en paralelo
      Promise.all(requiredLibraries.map(url => loadScript(url)))
        .then(() => {
          console.log("[ChartElement] ✅ Todas las bibliotecas para exportación cargadas");
          resolve();
        })
        .catch(error => {
          console.error("[ChartElement] Error cargando bibliotecas:", error);
          reject(error);
        });
    });
  };
  
  // Funciones para estados visuales
  instance.data.showLoadingState = function(lang) {
    const locale = instance.data.getLocale(lang);
    const container = document.getElementById(instance.data.container_id);
    if (!container) return;
    
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center">
        <div style="text-align:center">
          <div style="width:40px; height:40px; border:3px solid #f3f3f3; 
               border-top:3px solid #3498db; border-radius:50%; margin:0 auto;
               animation:spin 1s linear infinite"></div>
          <p>${locale.loading}</p>
        </div>
      </div>
      <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
    `;
  };

  instance.data.showEmptyState = function(lang) {
    const locale = instance.data.getLocale(lang);
    const container = document.getElementById(instance.data.container_id);
    if (!container) return;
    
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center">
        <div style="text-align:center; color:#888">
          <div style="font-size:24px; margin-bottom:10px">📊</div>
          <p>${locale.noData}</p>
        </div>
      </div>
    `;
  };

  instance.data.showErrorState = function(lang) {
    const locale = instance.data.getLocale(lang);
    const container = document.getElementById(instance.data.container_id);
    if (!container) return;
    
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center">
        <div style="text-align:center; color:#d9534f">
          <div style="font-size:24px; margin-bottom:10px">⚠️</div>
          <p>${locale.error}</p>
        </div>
      </div>
    `;
  };

  // Crear botón de exportación
  instance.data.createExportButton = function(lang) {
    const locale = instance.data.getLocale(lang);
    const container = document.getElementById(instance.data.container_id);
    if (!container) return;
    
    // Contenedor para el botón y menú
    const exportContainer = document.createElement("div");
    exportContainer.className = "export-container";
    exportContainer.style.position = "absolute";
    exportContainer.style.top = "10px";
    exportContainer.style.right = "80px"; // Ajustado para evitar superposición
    exportContainer.style.zIndex = "900"; // Ajustado para estar por debajo del menú de Plotly
    
    // Botón principal
    const exportButton = document.createElement("button");
    exportButton.className = "export-button";
    exportButton.innerHTML = `
      <span class="export-icon">📊</span>
      <span class="export-text">${locale.export}</span>
    `;
    exportButton.style.display = "flex";
    exportButton.style.alignItems = "center";
    exportButton.style.gap = "5px";
    exportButton.style.padding = "6px 12px";
    exportButton.style.backgroundColor = "#4285F4";
    exportButton.style.color = "white";
    exportButton.style.border = "none";
    exportButton.style.borderRadius = "4px";
    exportButton.style.cursor = "pointer";
    exportButton.style.fontSize = "13px";
    exportButton.style.fontFamily = "Arial, sans-serif";
    exportButton.style.transition = "background-color 0.2s";
    
    // Menú desplegable
    const exportMenu = document.createElement("div");
    exportMenu.className = "export-menu";
    exportMenu.style.position = "absolute";
    exportMenu.style.top = "100%";
    exportMenu.style.right = "0";
    exportMenu.style.marginTop = "5px";
    exportMenu.style.backgroundColor = "white";
    exportMenu.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
    exportMenu.style.borderRadius = "4px";
    exportMenu.style.minWidth = "150px";
    exportMenu.style.display = "none";
    exportMenu.style.zIndex = "1001";
    
    // Opciones de exportación
    const exportOptions = [
      { format: "csv", icon: "📄", label: locale.csv },
      { format: "excel", icon: "📊", label: locale.excel },
      { format: "pdf", icon: "📑", label: locale.pdf },
      { format: "image", icon: "🖼️", label: locale.image },
      { format: "json", icon: "📋", label: locale.json }
    ];
    
    // Implementar funciones de exportación directamente
    
    // Exportar a CSV
    function exportCSV(data, filename) {
      // Primero cargar las librerías necesarias
      instance.data.loadExportLibraries().then(() => {
        try {
          console.log("[ExportButton] 🔍 Iniciando exportación a CSV");
          
          // Extraer datos directamente de Plotly
          const exportData = instance.data.extractPlotlyData();
          
          if (!exportData || exportData.length === 0) {
            console.error("[ExportButton] ❌ No hay datos para exportar a CSV");
            return;
          }
          
          // Obtener encabezados
          const headers = Object.keys(exportData[0]);
          
          // Crear contenido CSV
          let csvContent = headers.join(",") + "\n";
          exportData.forEach(row => {
            const values = headers.map(header => {
              const val = row[header];
              // Manejar valores null, undefined y cadenas con comas
              if (val === null || val === undefined) return '';
              if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
              return val;
            });
            csvContent += values.join(",") + "\n";
          });
          
          // Crear Blob y descargar
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", filename);
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          console.log("[ExportButton] ✅ CSV exportado correctamente");
          
        } catch (error) {
          console.error("[ExportButton] ❌ Error exportando a CSV:", error);
        }
      });
    }
    
    // Exportar a Excel
    function exportExcel(data, filename) {
      // Primero cargar las librerías necesarias
      instance.data.loadExportLibraries().then(() => {
        try {
          console.log("[ExportButton] 🔍 Iniciando exportación a Excel");
          
          // Verificar que SheetJS está disponible
          if (!window.XLSX) {
            console.error("[ExportButton] ❌ SheetJS no está disponible");
            return;
          }
          
          // Extraer datos directamente de Plotly
          const exportData = instance.data.extractPlotlyData();
          
          if (!exportData || exportData.length === 0) {
            console.error("[ExportButton] ❌ No hay datos para exportar a Excel");
            return;
          }
          
          // Crear workbook
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(exportData);
          
          // Aplicar estilos básicos (encabezados en negrita)
          if (ws['!ref']) {
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cell = ws[XLSX.utils.encode_cell({r:0, c:C})];
              if (cell) cell.s = { font: { bold: true } };
            }
          }
          
          // Añadir worksheet al workbook
          XLSX.utils.book_append_sheet(wb, ws, "Datos");
          
          // Guardar archivo
          XLSX.writeFile(wb, filename);
          
          console.log("[ExportButton] ✅ Excel exportado correctamente");
          
        } catch (error) {
          console.error("[ExportButton] ❌ Error exportando a Excel:", error);
        }
      });
    }
    
// Exportar a PDF
    function exportPDF(filename) {
      // Primero cargar las librerías necesarias
      instance.data.loadExportLibraries().then(() => {
        try {
          // Verificar que jsPDF y html2canvas están disponibles
          if (!window.jspdf || !window.html2canvas) {
            console.error("[ExportButton] jsPDF o html2canvas no están disponibles");
            return;
          }
          
          // Obtener el elemento del gráfico
          const chartElement = document.getElementById(instance.data.container_id);
          if (!chartElement) {
            console.error("[ExportButton] Elemento del gráfico no encontrado");
            return;
          }
          
          // Configuración PDF
          const orientation = instance.data.pdfOrientation || "portrait";
          const title = instance.data.chartTitle || "";
          
          // Capturar gráfico como imagen
          html2canvas(chartElement, {
            scale: 2, // Mayor escala para mejor calidad
            useCORS: true, // Permitir imágenes externas
            logging: false,
            ignoreElements: (element) => {
              // Ignorar el botón de exportación para evitar que aparezca en el PDF
              return element.classList.contains('export-container');
            }
          }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            
            // Crear PDF
            const pdf = new jspdf.jsPDF({
              orientation: orientation,
              unit: 'mm',
              format: 'a4'
            });
            
            // Añadir título si existe
            if (title) {
              pdf.setFontSize(16);
              pdf.text(title, pdf.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            }
            
            // Calcular dimensiones para ajustar la imagen
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // Mantener relación de aspecto
            const imgWidth = pdfWidth - 20; // Margen de 10mm en cada lado
            const imgHeight = canvas.height * imgWidth / canvas.width;
            
            // Añadir imagen al PDF
            pdf.addImage(
              imgData, 
              'PNG', 
              10, 
              title ? 25 : 10, 
              imgWidth, 
              imgHeight
            );
            
            // Guardar PDF
            pdf.save(filename);
          });
        } catch (error) {
          console.error("[ExportButton] ❌ Error exportando a PDF:", error);
        }
      });
    }
    
    // Exportar como imagen
    function exportImage(filename) {
      // Primero cargar las librerías necesarias
      instance.data.loadExportLibraries().then(() => {
        try {
          // Verificar que html2canvas está disponible
          if (!window.html2canvas) {
            console.error("[ExportButton] ❌ html2canvas no está disponible");
            return;
          }
          
          // Obtener el elemento del gráfico
          const chartElement = document.getElementById(instance.data.container_id);
          if (!chartElement) {
            console.error("[ExportButton] ❌ Elemento del gráfico no encontrado");
            return;
          }
          
          // Capturar gráfico como imagen
          html2canvas(chartElement, {
            scale: 2, // Mayor escala para mejor calidad
            useCORS: true, // Permitir imágenes externas
            logging: false,
            ignoreElements: (element) => {
              // Ignorar el botón de exportación para evitar que aparezca en la imagen
              return element.classList.contains('export-container');
            }
          }).then(canvas => {
            // Descargar imagen
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
          });
        } catch (error) {
          console.error("[ExportButton] ❌ Error exportando como imagen:", error);
        }
      });
    }
    
    // Exportar a JSON
    function exportJSON(data, filename) {
      // Primero cargar las librerías necesarias
      instance.data.loadExportLibraries().then(() => {
        try {
          console.log("[ExportButton] 🔍 Iniciando exportación a JSON");
          
          // Extraer datos directamente de Plotly
          const exportData = instance.data.extractPlotlyData();
          
          if (!exportData || exportData.length === 0) {
            console.error("[ExportButton] ❌ No hay datos para exportar");
            return;
          }
          
          // Convertir a JSON con formato
          const jsonStr = JSON.stringify(exportData, null, 2);
          
          // Crear Blob y descargar
          const blob = new Blob([jsonStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", filename);
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          console.log("[ExportButton] ✅ JSON exportado correctamente");
          
        } catch (error) {
          console.error("[ExportButton] ❌ Error exportando a JSON:", error);
        }
      });
    }
    
    // Agregar opciones al menú
    exportOptions.forEach(option => {
      const menuItem = document.createElement("div");
      menuItem.className = "export-menu-item";
      menuItem.dataset.format = option.format;
      menuItem.innerHTML = `
        <span class="menu-item-icon">${option.icon}</span>
        <span class="menu-item-label">${option.label}</span>
      `;
      menuItem.style.padding = "8px 12px";
      menuItem.style.cursor = "pointer";
      menuItem.style.display = "flex";
      menuItem.style.alignItems = "center";
      menuItem.style.gap = "8px";
      menuItem.style.color = "#333";
      menuItem.style.fontSize = "13px";
      menuItem.style.transition = "background-color 0.2s";
      
      // Eventos
      menuItem.addEventListener("mouseover", () => {
        menuItem.style.backgroundColor = "#f5f5f5";
      });
      
      menuItem.addEventListener("mouseout", () => {
        menuItem.style.backgroundColor = "transparent";
      });
      
      menuItem.addEventListener("click", () => {
        // Ocultar menú
        exportMenu.style.display = "none";
        
        console.log("[ExportButton] 🔍 Click en opción de exportación:", menuItem.dataset.format);
        
        // Mostrar estado de carga en el botón
        exportButton.innerHTML = `
          <span class="loading-spinner" style="width:13px; height:13px; border:2px solid rgba(255,255,255,0.3); 
               border-radius:50%; border-top-color:white; animation:spin 1s linear infinite;"></span>
          <span class="export-text">${locale.exportingData}</span>
        `;
        exportButton.disabled = true;
        exportButton.style.backgroundColor = "#9E9E9E";
        
        // Obtener el formato
        const format = menuItem.dataset.format;
        
        // Generar nombre de archivo
        const fileExtension = {
          csv: 'csv',
          excel: 'xlsx',
          pdf: 'pdf',
          image: 'png',
          json: 'json'
        }[format] || 'txt';
        
        const filename = `${instance.data.filenamePrefix || 'chart'}_${instance.data.formatDate()}.${fileExtension}`;
        console.log("[ExportButton] 🔍 Nombre de archivo:", filename);
        
        // Ejecutar exportación según el formato
        try {
          instance.data.loadExportLibraries().then(() => {
            console.log("[ExportButton] ✅ Bibliotecas cargadas, iniciando exportación formato:", format);
            
            switch (format) {
              case "csv":
                exportCSV(null, filename);
                break;
              case "excel":
                exportExcel(null, filename);
                break;
              case "pdf":
                exportPDF(filename);
                break;
              case "image":
                exportImage(filename);
                break;
              case "json":
                exportJSON(null, filename);
                break;
            }
            
            // Restaurar botón después de la exportación
            setTimeout(() => {
              exportButton.innerHTML = `
                <span class="export-icon">📊</span>
                <span class="export-text">${locale.export}</span>
              `;
              exportButton.disabled = false;
              exportButton.style.backgroundColor = "#4285F4";
            }, 1000);
          }).catch(error => {
            console.error("[ExportButton] ❌ Error en exportación:", error);
            
            // Restaurar botón en caso de error
            exportButton.innerHTML = `
              <span class="export-icon">📊</span>
              <span class="export-text">${locale.export}</span>
            `;
            exportButton.disabled = false;
            exportButton.style.backgroundColor = "#4285F4";
          });
        } catch (error) {
          console.error("[ExportButton] ❌ Error en exportación:", error);
          
          // Restaurar botón en caso de error
          exportButton.innerHTML = `
            <span class="export-icon">📊</span>
            <span class="export-text">${locale.export}</span>
          `;
          exportButton.disabled = false;
          exportButton.style.backgroundColor = "#4285F4";
        }
      });
      
      exportMenu.appendChild(menuItem);
    });
    
    // Eventos del botón principal
    exportButton.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.style.display = exportMenu.style.display === "none" ? "block" : "none";
      
      if (exportMenu.style.display === "block") {
        exportButton.style.backgroundColor = "#3367D6";
      } else {
        exportButton.style.backgroundColor = "#4285F4";
      }
    });
    
    // Cerrar menú al hacer clic fuera
    document.addEventListener("click", () => {
      exportMenu.style.display = "none";
      if (!exportButton.disabled) {
        exportButton.style.backgroundColor = "#4285F4";
      }
    });
    
    // Agregar elementos al DOM
    exportContainer.appendChild(exportButton);
    exportContainer.appendChild(exportMenu);
    container.appendChild(exportContainer);
    
    // Almacenar referencias
    instance.data.exportButton = exportButton;
    instance.data.exportMenu = exportMenu;
    instance.data.exportContainer = exportContainer;
  };

  // Función mejorada para renderizar gráficos con mejores proporciones
  instance.data.renderPlotlyChart = function renderPlotlyChart(instanceId, chart_type, traceData, layoutOptions = {}, configOptions = {}) {
    // Almacenar referencias a los datos actuales para exportación
    console.log("[ChartElement] 🔍 Guardando referencias para exportación:");
    console.log("- Tipo de gráfico:", chart_type);
    console.log("- Datos de trazas:", traceData);
    console.log("- Datos de entrada:", configOptions.inputData);
    
    instance.data.currentChartType = chart_type;
    instance.data.currentTraces = traceData;
    instance.data.chartTitle = layoutOptions.title?.text || "";
    instance.data.filenamePrefix = configOptions.filenamePrefix || "chart";
    instance.data.pdfOrientation = configOptions.pdfOrientation || "portrait";
    
    // Guardar una copia de los datos originales si están disponibles
    if (configOptions.inputData && Array.isArray(configOptions.inputData) && configOptions.inputData.length > 0) {
      console.log("[ChartElement] ✅ Guardando datos originales para exportación");
      instance.data.inputData = [...configOptions.inputData]; // Clonar para evitar referencias
    } else {
      console.log("[ChartElement] ⚠️ No hay datos originales, se usarán datos procesados");
      // Los datos se extraerán bajo demanda con extractPlotlyData
    }
    
    let traces = traceData;
    const type = chart_type.toLowerCase();
    
    // Obtener el contenedor y sus dimensiones
    const container = document.getElementById(instanceId);
    if (!container) {
      console.error("[ChartElement] ❌ No se encontró el contenedor:", instanceId);
      return;
    }
    
    // Asegurar que el contenedor tenga altura mínima adecuada
    if (container.clientHeight < 300) {
      container.style.height = "300px";
    }
    
    // Obtener dimensiones reales del contenedor
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    console.log(`[ChartElement] 📏 Dimensiones del contenedor: ${containerWidth}x${containerHeight}`);
    
    // Crear layout base con dimensiones explícitas
    let layout = { 
      ...layoutOptions,
      // Establecer dimensiones explícitas basadas en el contenedor
      width: containerWidth,
      height: containerHeight,
      autosize: true, // Mantener autosize para adaptarse a cambios
      
      // Ajustar márgenes para maximizar área de visualización
      margin: { 
        t: layoutOptions.margin?.t || 40, 
        r: layoutOptions.margin?.r || 20, 
        l: layoutOptions.margin?.l || 50, 
        b: layoutOptions.margin?.b || 60 
      },
      
      // Configuración mejorada para ejes
      xaxis: {
        ...layoutOptions.xaxis,
        automargin: true,
        nticks: layoutOptions.xaxis?.nticks || 10
      },
      yaxis: {
        ...layoutOptions.yaxis,
        automargin: true
      }
    };
    
    // Configuración específica según tipo de gráfico
    if (["pie", "donut", "doughnut", "funnel_area"].includes(type)) {
      // Para gráficos circulares, usar márgenes más pequeños
      layout.margin = { t: 30, r: 30, l: 30, b: 30 };
    } else if (["heatmap", "contour", "histogram2d", "histogram2dcontour"].includes(type)) {
      // Para heatmaps y similares, asegurar que la escala de color tenga espacio
      layout.margin.r = 70;
    } else if (["ohlc", "candlestick"].includes(type)) {
      // Para gráficos financieros
      layout.xaxis.rangeslider = { visible: false };
    }
    
    // Verificar si los trazos ya tienen tipo asignado
    const hasType = traces.length > 0 && traces[0].type;
    
    // Si no tienen tipo asignado, aplicar transformaciones según el tipo de gráfico
    if (!hasType) {
      switch (type) {
        case "bar":
        case "column":
          traces = traces.map(trace => ({ 
            ...trace, 
            type: "bar",
            width: 0.7 // Barras más anchas
          }));
          
          // Si es gráfico de columnas horizontales
          if (type === "column") {
            layout.xaxis.autorange = "reversed";
            layout.yaxis.autorange = true;
          }
          break;

        case "line":
          traces = traces.map(trace => ({ 
            ...trace, 
            type: "scatter", 
            mode: "lines",
            line: { 
              ...trace.line,
              width: 3 // Líneas más gruesas
            }
          }));
          break;

        case "area":
          traces = traces.map(trace => ({ 
            ...trace, 
            type: "scatter", 
            mode: "lines", 
            fill: "tozeroy",
            line: { 
              ...trace.line,
              width: 2
            }
          }));
          break;

        case "scatter":
          traces = traces.map(trace => ({ 
            ...trace, 
            type: "scatter", 
            mode: trace.mode || "markers",
            marker: {
              ...trace.marker,
              size: 10, // Marcadores más grandes
              opacity: 0.7
            }
          }));
          break;

        case "bubble":
          traces = traces.map(trace => ({
            ...trace,
            type: "scatter",
            mode: "markers",
            marker: {
              size: trace.sizes,
              color: trace.marker?.color || undefined,
              sizemode: "area",
              sizeref: 2.0 * Math.max(...(trace.sizes || [1])) / (100 ** 2),
              sizemin: 4,
              opacity: 0.7
            }
          }));
          break;

        case "pie":
        case "doughnut":
        case "donut":
          traces = [{
            type: "pie",
            labels: traces[0]?.labels || [],
            values: traces[0]?.values || [],
            hole: chart_type === "doughnut" || chart_type === "donut" ? 0.4 : 0,
            textposition: "inside",
            textinfo: "percent+label",
            insidetextorientation: "radial"
          }];
          
        // Ajustar layout para gráficos circulares
          layout.margin = { t: 30, r: 30, l: 30, b: 30 };
          break;

        case "radar":
          traces = traces.map(trace => ({
            type: "scatterpolar",
            r: trace.r,
            theta: trace.theta,
            fill: "toself",
            name: trace.name,
            line: { width: 3 }
          }));
          layout = {
            ...layout,
            polar: { 
              radialaxis: { visible: true, angle: 90 },
              angularaxis: { direction: "clockwise" }
            },
            showlegend: true
          };
          break;

        case "funnel":
          traces = [{
            type: "funnel",
            x: traces[0]?.x,
            y: traces[0]?.y,
            textposition: "inside",
            textinfo: "value+percent"
          }];
          break;

        case "box":
          traces = traces.map(trace => ({
            ...trace,
            type: "box",
            boxpoints: "suspectedoutliers",
            boxmean: true
          }));
          break;

        case "violin":
          traces = traces.map(trace => ({
            ...trace,
            type: "violin",
            box: { visible: true },
            meanline: { visible: true }
          }));
          break;

        case "histogram":
          traces = traces.map(trace => ({
            ...trace,
            type: "histogram",
            opacity: 0.7
          }));
          break;

        case "heatmap":
          // Para heatmap se necesita una matriz z que representa valores en coordenadas x, y
          if (traces[0] && traces[0].z) {
            traces = [{
              type: "heatmap",
              x: traces[0].x,
              y: traces[0].y,
              z: traces[0].z,
              colorscale: traces[0].colorscale || "Viridis",
              showscale: true
            }];
          } else {
            console.warn("[ChartElement] ❌ Datos de heatmap incorrectos. Se necesita matriz z.");
            return;
          }
          break;

        case "contour":
          // Para contour se necesita también una matriz z
          if (traces[0] && traces[0].z) {
            traces = [{
              type: "contour",
              x: traces[0].x,
              y: traces[0].y,
              z: traces[0].z,
              colorscale: traces[0].colorscale || "Viridis",
              contours: {
                coloring: 'heatmap',
                showlabels: true
              },
              showscale: true
            }];
          } else {
            console.warn("[ChartElement] ❌ Datos de contour incorrectos. Se necesita matriz z.");
            return;
          }
          break;
        case "histogram2d":
          if (traces[0] && traces[0].x && traces[0].y) {
            traces = [{
              type: "histogram2d",
              x: traces[0].x,
              y: traces[0].y,
              colorscale: traces[0].colorscale || "Viridis",
              autobinx: true,
              autobiny: true,
              showscale: true
            }];
          } else {
            console.warn("[ChartElement] ❌ Datos de histogram2d incorrectos.");
            return;
          }
          break;

        case "histogram2dcontour":
          if (traces[0] && traces[0].x && traces[0].y) {
            traces = [{
              type: "histogram2dcontour",
              x: traces[0].x,
              y: traces[0].y,
              colorscale: traces[0].colorscale || "Viridis",
              autobinx: true,
              autobiny: true,
              showscale: true,
              contours: {
                showlabels: true,
                coloring: 'heatmap'
              }
            }];
          } else {
            console.warn("[ChartElement] ❌ Datos de histogram2dcontour incorrectos.");
            return;
          }
          break;
        case "funnel_area":
          traces = traces.map(trace => ({
            ...trace,
            type: "funnelarea",
            textinfo: "label+percent",
            textposition: "inside",
            hoverinfo: "label+percent+text",
            marker: {
              colors: trace.colors && trace.colors.length > 0 ? trace.colors : undefined,
              line: { width: 2 }
            }
          }));
          
          // Ajustar layout para gráficos circulares
          layout.margin = { t: 30, r: 30, l: 30, b: 30 };
          break;
          
        case "waterfall":
          traces = traces.map(trace => ({
            ...trace,
            type: "waterfall",
            measure: trace.measure,
            textposition: "outside",
            textinfo: "value",
            connector: {
              line: { color: "rgb(63, 63, 63)" }
            }
          }));
          break;
          
        case "ohlc":
          traces = [{
            type: "ohlc",
            x: traces[0]?.x || [],
            open: traces[0]?.open || [],
            high: traces[0]?.high || [],
            low: traces[0]?.low || [],
            close: traces[0]?.close || [],
            increasing: { line: { color: "#26A69A" } },
            decreasing: { line: { color: "#EF5350" } }
          }];
          
          // Configuración especial para ejes de tiempo
          layout.xaxis = {
            ...layout.xaxis,
            rangeslider: { visible: false },
            type: 'category'
          };
          break;
          
        case "candlestick":
          traces = [{
            type: "candlestick",
            x: traces[0]?.x || [],
            open: traces[0]?.open || [],
            high: traces[0]?.high || [],
            low: traces[0]?.low || [],
            close: traces[0]?.close || [],
            increasing: { fillcolor: "#26A69A", line: { color: "#26A69A" } },
            decreasing: { fillcolor: "#EF5350", line: { color: "#EF5350" } }
          }];
          
          // Configuración especial para ejes de tiempo
          layout.xaxis = {
            ...layout.xaxis,
            rangeslider: { visible: false },
            type: 'category'
          };
          break;

        default:
          console.warn(`[ChartElement] ❌ Tipo de gráfico no soportado: ${chart_type}`);
          return;
      }
    }

    // Debuggear las imágenes configuradas
    if (configOptions.images && Array.isArray(configOptions.images)) {
      console.log("[ChartElement] 🔍 Imágenes configuradas:", configOptions.images);
      
      // Filtrar imágenes inválidas
      const validImages = configOptions.images.filter(img => img && img.source);
      
      if (validImages.length > 0) {
        console.log("[ChartElement] ✅ Imágenes válidas para agregar:", validImages.length);
        
        // IMPORTANTE: Añadir imágenes directamente al layout, no al config
        layout.images = validImages;
        
        // Ajustar márgenes si hay logos
        const hasLogo = validImages.some(img => 
          img.layer === "above" && img.xanchor === "right" && img.yanchor === "top");
        
        if (hasLogo && !layout.margin?.t) {
          // Aumentar margen superior si hay logo
          layout.margin = {
            ...(layout.margin || {}),
            t: 50
          };
          console.log("[ChartElement] 🔍 Margen superior ajustado para logo");
        }
      }
    }
    
    // Configuración mejorada
    const enhancedConfig = {
      ...configOptions,
      responsive: true,
      displayModeBar: configOptions.displayModeBar !== undefined ? 
        configOptions.displayModeBar : 'hover',
      displaylogo: false,
      scrollZoom: configOptions.scrollZoom || false,
      // Habilitar botón de descarga nativo de Plotly
      toImageButtonOptions: {
        format: 'png',
        filename: 'plot_image',
        height: containerHeight,
        width: containerWidth,
        scale: 2
      }
    };
    
    // Almacenar datos y configuración para uso en exportaciones
    instance.data.chartTitle = layout.title?.text || "";
    instance.data.inputData = configOptions.inputData;
    instance.data.filenamePrefix = configOptions.filenamePrefix || "chart";
    instance.data.pdfOrientation = configOptions.pdfOrientation || "portrait";
    
    // Renderizar el gráfico
    try {
      Plotly.newPlot(instanceId, traces, layout, enhancedConfig);
      console.log(`[ChartElement] ✅ Renderizado gráfico tipo: ${chart_type} (${containerWidth}x${containerHeight})`);
      
      // Si hay imágenes, aplicarlas explícitamente con relayout
      if (layout.images && layout.images.length > 0) {
        console.log("[ChartElement] 🔍 Aplicando imágenes con relayout:", layout.images);
        
        // Esperar a que el gráfico se renderice
        setTimeout(() => {
          try {
            Plotly.relayout(instanceId, { images: layout.images });
            console.log("[ChartElement] ✅ Imágenes aplicadas con relayout");
          } catch (error) {
            console.error("[ChartElement] ❌ Error aplicando imágenes con relayout:", error);
          }
        }, 100);
      }
      
      // Crear botón de exportación si está habilitado
      if (configOptions.enableExport !== false) {
        // Pequeño retraso para asegurar que el gráfico esté renderizado
        setTimeout(() => {
          // Eliminar botón existente si lo hay
          const existingExportContainer = container.querySelector(".export-container");
          if (existingExportContainer) {
            existingExportContainer.remove();
          }
          
          // Crear nuevo botón
          instance.data.createExportButton(configOptions.language || "auto");
          
          // Aplicar estilos personalizados al botón después de crearlo
          setTimeout(() => {
            const exportButton = instance.data.exportButton;
            if (exportButton) {
              instance.data.applyExportButtonStyles(exportButton, {
                buttonColor: configOptions.buttonColor,
                textColor: configOptions.textColor,
                buttonText: configOptions.buttonText,
                buttonIcon: configOptions.buttonIcon
              });
            }
          }, 50);
        }, 100);
      }
      
      // Añadir evento de redimensionamiento para actualizar el gráfico cuando el contenedor cambie
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            console.log(`[ChartElement] 🔄 Redimensionando gráfico a: ${width}x${height}`);
            Plotly.relayout(instanceId, {
              width: width,
              height: height
            });
          }
        }
      });
      
      resizeObserver.observe(container);
      
      // Guardar referencia al observer para limpieza
      if (!instance.data.resizeObservers) {
        instance.data.resizeObservers = {};
      }
      instance.data.resizeObservers[instanceId] = resizeObserver;
      
    } catch (error) {
      console.error("[ChartElement] Error al renderizar gráfico:", error);
      container.innerHTML = `
        <div style="display:flex; height:100%; align-items:center; justify-content:center">
          <div style="text-align:center; color:#d9534f">
            <div style="font-size:24px; margin-bottom:10px">⚠️</div>
            <p>Error al renderizar: ${error.message}</p>
          </div>
        </div>
      `;
      return;
    }
    
    // Configurar eventos si están habilitados
    if (configOptions.enableInteractions) {
      const plotlyContainer = document.getElementById(instanceId);
      
      if (plotlyContainer && typeof plotlyContainer.on === 'function') {
        plotlyContainer.on('plotly_click', function(data) {
          if (!data || !data.points || data.points.length === 0) return;
          
          const point = data.points[0];
          const clickData = {
            series: point.data.name,
            category: point.x,
            value: point.y,
            curveNumber: point.curveNumber,
            pointNumber: point.pointNumber
          };
          
          // Implementar comportamiento según configuración
          if (configOptions.clickBehavior === "highlight") {
            // Resaltar punto seleccionado
            const update = {
              'marker.size': Array(traces.length).fill(8),
              'marker.opacity': Array(traces.length).fill(0.6)
            };
            
            update['marker.size'][point.curveNumber] = 15;
            update['marker.opacity'][point.curveNumber] = 1;
            
            Plotly.restyle(instanceId, update);
          }
          
          // Disparar evento para Bubble
          if (instance.triggerEvent) {
            instance.triggerEvent("element_clicked", clickData);
          }
          
          // Si está habilitada la sincronización con dashboard, emitir evento
          if (configOptions.enableSync && instance.data.dashboardParent) {
            instance.data.dashboardParent.eventBus.publish('chart-click', {
              chartId: instance.data.container_id,
              data: clickData
            });
          }
        });
        
        // Añadir evento para filtros si está habilitada la sincronización
        if (configOptions.enableSync && instance.data.dashboardParent) {
          plotlyContainer.on('plotly_legendclick', function(data) {
            // Emitir evento de filtro
            instance.data.dashboardParent.eventBus.publish('chart-filter', {
              chartId: instance.data.container_id,
              filter: {
                type: 'legend',
                series: data.curveNumber !== undefined ? 
                  data.data[data.curveNumber].name : null
              }
            });
            
            // Por defecto permitir filtrar con la leyenda
            return false;
          });
        }
      }
    }
  };
  
  // Función para limpiar recursos cuando el componente se destruye
  instance.data.cleanup = function() {
    // Desconectar todos los observadores de redimensionamiento
    if (instance.data.resizeObservers) {
      Object.values(instance.data.resizeObservers).forEach(observer => {
        observer.disconnect();
      });
      instance.data.resizeObservers = {};
    }
    
    // Desuscribirse de eventos del dashboard
    if (instance.data.filterUnsubscribe) {
      instance.data.filterUnsubscribe();
    }
    if (instance.data.selectionUnsubscribe) {
      instance.data.selectionUnsubscribe();
    }
    
    // Si es un dashboard, limpiar los charts
    if (instance.data.isDashboard && Array.isArray(instance.data.charts)) {
      instance.data.removeAllCharts();
      
      // Eliminar el botón de añadir
      if (instance.data.addButton && instance.data.addButton.parentNode) {
        instance.data.addButton.parentNode.removeChild(instance.data.addButton);
      }
      
      // Eliminar estilos de media queries
      if (instance.data.styleElement && instance.data.styleElement.parentNode) {
        instance.data.styleElement.parentNode.removeChild(instance.data.styleElement);
      }
    }
    
    // Limpiar el contenedor
    const container = document.getElementById(instance.data.container_id);
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    
    // Limpiar caché
    instance.data.cache = {
      inputHash: "",
      result: null
    };
    
    console.log("[ChartElement] 🧹 Recursos liberados correctamente.");
  };

  // Sistema para gestión de imágenes en gráficos
  instance.data.imageManager = {
    // Almacén de imágenes precargadas
    cache: new Map(),
    
    // Función para precargar imágenes (mejora el rendimiento)
    preloadImage: function(url) {
      return new Promise((resolve, reject) => {
        if (this.cache.has(url)) {
          resolve(url);
          return;
        }
        
        const img = new Image();
        img.onload = () => {
          this.cache.set(url, true);
          resolve(url);
        };
        img.onerror = () => {
          reject(new Error(`No se pudo cargar la imagen: ${url}`));
        };
        img.src = url;
      });
    },
    
    // Validar URL de imágenes
    validateImageUrl: function(url) {
      if (!url) return false;
      
      // Verificar si es una URL válida
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    },
    
    // Crear configuración de imagen para Plotly
    createImageConfig: function(options) {
      const defaults = {
        source: "",           // URL de la imagen
        x: 1,                 // Posición X (0-1 en paper, valor numérico en coordenadas)
        y: 1,                 // Posición Y
        xref: "paper",        // Referencia X: "paper" o "x"
        yref: "paper",        // Referencia Y: "paper" o "y"
        xanchor: "right",     // Anclaje X: "left", "center", "right"
        yanchor: "top",       // Anclaje Y: "top", "middle", "bottom"
        sizex: 0.1,           // Ancho (como fracción del gráfico)
        sizey: 0.1,           // Alto
        opacity: 1,           // Opacidad (0-1)
        layer: "above",       // Capa: "below" o "above"
        sizing: "contain"     // Ajuste: "contain", "stretch", "fill"
      };
      
      return {
        ...defaults,
        ...options
      };
    },
    
    // Configuración de logo para la esquina superior derecha
    createLogo: function(logoUrl, options = {}) {
      console.log("[ChartElement] 🔍 Creando logo con URL:", logoUrl);
      
      instance.data.validateAndFetchImage(logoUrl)
        .then(result => {
          console.log("[ChartElement] ✅ Logo validado:", result);
        })
        .catch(error => {
          console.warn("[ChartElement] ⚠️ Logo no válido:", error.message);
        });
      
      // Crear configuración incluso si falla la validación, Plotly manejará el error
      return this.createImageConfig({
        source: logoUrl,
        x: 1,
        y: 1,
        sizex: 0.15, 
        sizey: 0.15,
        xanchor: "right",
        yanchor: "top",
        layer: "above",
        visible: true,
        ...options
      });
    },
    
    // Configuración de marca de agua centrada
    createWatermark: function(watermarkUrl, options = {}) {
      if (!this.validateImageUrl(watermarkUrl)) {
        console.warn("[ChartElement] URL de marca de agua inválida:", watermarkUrl);
        return null;
      }
      
      return this.createImageConfig({
        source: watermarkUrl,
        x: 0.5,
        y: 0.5,
        sizex: 0.5,
        sizey: 0.5,
        xanchor: "center",
        yanchor: "middle",
        opacity: 0.1,
        layer: "below",
        ...options
      });
    },
    
    // Configuración de imagen de fondo
    createBackgroundImage: function(bgUrl, options = {}) {
      if (!this.validateImageUrl(bgUrl)) {
        console.warn("[ChartElement] URL de fondo inválida:", bgUrl);
        return null;
      }
      
      return this.createImageConfig({
        source: bgUrl,
        x: 0,
        y: 1,
        sizex: 1,
        sizey: 1,
        xanchor: "left",
        yanchor: "top",
        opacity: 0.1,
        layer: "below",
        sizing: "stretch",
        ...options
      });
    },
    
    // Añadir imágenes decorativas en posiciones específicas
    createDecorativeImage: function(imageUrl, position = "top-left", options = {}) {
      if (!this.validateImageUrl(imageUrl)) {
        console.warn("[ChartElement] URL de imagen decorativa inválida:", imageUrl);
        return null;
      }
      
      // Mapeo de posiciones predefinidas
      const positionMap = {
        "top-left": { x: 0, y: 1, xanchor: "left", yanchor: "top" },
        "top-right": { x: 1, y: 1, xanchor: "right", yanchor: "top" },
        "bottom-left": { x: 0, y: 0, xanchor: "left", yanchor: "bottom" },
        "bottom-right": { x: 1, y: 0, xanchor: "right", yanchor: "bottom" },
        "center": { x: 0.5, y: 0.5, xanchor: "center", yanchor: "middle" }
      };
      
      const posConfig = positionMap[position] || positionMap["top-right"];
      
      return this.createImageConfig({
        source: imageUrl,
        sizex: 0.1,
        sizey: 0.1,
        ...posConfig,
        ...options
      });
    }
  };
  
  // Función utilitaria para gestionar escalas de colores
  instance.data.getColorScale = function(name) {
    // Escalas de colores predefinidas
    const colorScales = {
      // Escalas colorblind-friendly
      "Viridis": [
        [0, "rgb(68, 1, 84)"],
        [0.25, "rgb(59, 82, 139)"],
        [0.5, "rgb(33, 144, 141)"],
        [0.75, "rgb(93, 201, 99)"],
        [1, "rgb(253, 231, 37)"]
      ],
      "Plasma": [
        [0, "rgb(13, 8, 135)"],
        [0.25, "rgb(126, 3, 168)"],
        [0.5, "rgb(204, 71, 120)"],
        [0.75, "rgb(248, 149, 64)"],
        [1, "rgb(240, 249, 33)"]
      ],
      "Inferno": [
        [0, "rgb(0, 0, 4)"],
        [0.25, "rgb(102, 14, 122)"],
        [0.5, "rgb(214, 55, 79)"],
        [0.75, "rgb(252, 149, 34)"],
        [1, "rgb(252, 254, 164)"]
      ],
      "Blues": [
        [0, "rgb(247, 251, 255)"],
        [0.2, "rgb(198, 219, 239)"],
        [0.4, "rgb(158, 202, 225)"],
        [0.6, "rgb(107, 174, 214)"],
        [0.8, "rgb(49, 130, 189)"],
        [1, "rgb(8, 81, 156)"]
      ],
      "YlOrRd": [
        [0, "rgb(255, 255, 204)"],
        [0.2, "rgb(255, 237, 160)"],
        [0.4, "rgb(254, 217, 118)"],
        [0.6, "rgb(254, 178, 76)"],
        [0.8, "rgb(253, 141, 60)"],
        [1, "rgb(189, 0, 38)"]
      ],
      "RdBu": [
        [0, "rgb(5, 48, 97)"],
        [0.25, "rgb(42, 113, 178)"],
        [0.5, "rgb(247, 247, 247)"],
        [0.75, "rgb(214, 96, 77)"],
        [1, "rgb(103, 0, 31)"]
      ],
      // Escalas corporativas
      "Corporate": [
        [0, "rgb(0, 92, 169)"],
        [0.33, "rgb(88, 166, 219)"],
        [0.66, "rgb(177, 214, 240)"],
        [1, "rgb(237, 248, 251)"]
      ],
      "Revenue": [
        [0, "rgb(44, 162, 95)"],
        [0.33, "rgb(127, 205, 145)"],
        [0.66, "rgb(199, 233, 180)"],
        [1, "rgb(237, 248, 251)"]
      ],
      "Expenses": [
        [0, "rgb(215, 48, 39)"],
        [0.33, "rgb(244, 109, 67)"],
        [0.66, "rgb(253, 174, 97)"],
        [1, "rgb(254, 224, 144)"]
      ]
    };
    
    // Devolver escala de colores seleccionada o la predeterminada
    return colorScales[name] || name || "Viridis";
  };
  
  // SECCIÓN DE DASHBOARD: Verificar si este elemento es un dashboard o un gráfico individual
  if (properties.is_dashboard) {
    console.log("[Dashboard] Inicializando contenedor de dashboard...");
 // Procesar configuración de gráficos con el helper - NUEVO
    if (!properties.chart_configs || 
        properties.chart_configs.length === 0) {
      properties.chart_configs = buildChartConfigs(properties);
console.log("[DEBUG] chart_configs después de buildChartConfigs:", properties.chart_configs);
    }
    
    // Modificar el contenedor existente para funcionar como grid
    container.className += " dashboard-grid";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(12, 1fr)";
    container.style.gridAutoRows = "minmax(200px, auto)";
    container.style.gap = "15px";
    container.style.padding = "20px";
    
    // Almacenar referencias específicas del dashboard
    instance.data.isDashboard = true;
    instance.data.charts = [];
    
    // Inicializar bus de eventos para sincronización
    instance.data.eventBus = {
      events: {},
      
      // Suscribirse a un evento
      subscribe: function(event, callback) {
        if (!this.events[event]) {
          this.events[event] = [];
        }
        this.events[event].push(callback);
        
        // Devolver función para cancelar suscripción
        return () => {
          this.events[event] = this.events[event].filter(cb => cb !== callback);
        };
      },
      
      // Publicar un evento
      publish: function(event, data) {
        if (this.events[event]) {
          this.events[event].forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error(`[EventBus] Error en callback para ${event}:`, error);
            }
          });
        }
      }
    };
    
    // Sistema de guardado y carga de layouts
    instance.data.layoutManager = {
      // Guardar layout actual
      saveLayout: function() {
        const layout = {
          grid: instance.data.gridConfig,
          charts: instance.data.charts.map(chart => ({
            id: chart.id,
            type: chart.type,
            position: chart.position,
            dataSource: chart.dataSource,
            config: chart.config
          }))
        };
        
        return layout;
      },
      
      // Cargar layout guardado
      loadLayout: function(layout) {
        if (!layout || !layout.grid || !layout.charts) {
          console.warn("[Dashboard] Formato de layout inválido");
          return false;
        }
        
        // Aplicar configuración de grilla
        instance.data.applyGridConfig(layout.grid);
        
        // Eliminar gráficos existentes
        instance.data.removeAllCharts();
        
        // Crear nuevos gráficos según el layout
        layout.charts.forEach(chartConfig => {
          instance.data.addChart(
            chartConfig.type,
            chartConfig.position,
            chartConfig.dataSource,
            chartConfig.config
          );
        });
        
        return true;
      }
    };
    
    // Función para aplicar configuración de grilla
    instance.data.applyGridConfig = function(config) {
      const container = instance.data.container;
      
      // Guardar configuración
      instance.data.gridConfig = config;
      
      // Aplicar configuración de columnas y filas
      container.style.gridTemplateColumns = `repeat(${config.columns}, 1fr)`;
      container.style.gridAutoRows = `${config.rowHeight || 200}px`;
      container.style.gap = `${config.gap || 15}px`;
      container.style.padding = `${config.padding || 20}px`;
      
      // Aplicar diseño responsivo si está configurado
      if (config.responsive) {
        // Media queries para responsividad
        const styleId = "dashboard-responsive-style-" + instance.data.container_id;
        let styleElement = document.getElementById(styleId);
        
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = styleId;
          document.head.appendChild(styleElement);
        }
        
        styleElement.innerHTML = `
          @media (max-width: 768px) {
            #${instance.data.container_id} {
              grid-template-columns: repeat(${config.breakpoints?.tablet?.columns || 6}, 1fr);
            }
          }
          @media (max-width: 480px) {
            #${instance.data.container_id} {
              grid-template-columns: repeat(${config.breakpoints?.mobile?.columns || 2}, 1fr);
            }
          }
        `;
        
        instance.data.styleElement = styleElement;
      }
    };
    
    // Función para añadir un gráfico al dashboard
    instance.data.addChart = function(chartType, position, dataSource, config = {}) {
      // Crear contenedor para el gráfico
      const chartContainer = document.createElement("div");
      const chartId = `chart-${instance.data.charts.length + 1}-${Date.now()}`;
      chartContainer.id = chartId;
      chartContainer.className = "dashboard-chart";
      chartContainer.style.gridColumn = `span ${position.width || 3}`;
      chartContainer.style.gridRow = `span ${position.height || 2}`;
      
      // Si se especifica posición explícita, usarla
      if (position.column && position.row) {
        chartContainer.style.gridColumnStart = position.column;
        chartContainer.style.gridRowStart = position.row;
      }
      
      // Estilos para el contenedor de gráfico
      chartContainer.style.backgroundColor = "white";
      chartContainer.style.borderRadius = "8px";
      chartContainer.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
      chartContainer.style.overflow = "hidden";
      chartContainer.style.display = "flex";
      chartContainer.style.flexDirection = "column";
      
      // Añadir barra de título
      const titleBar = document.createElement("div");
      titleBar.className = "chart-title-bar";
      titleBar.style.padding = "10px 15px";
      titleBar.style.borderBottom = "1px solid #eaeaea";
      titleBar.style.display = "flex";
      titleBar.style.justifyContent = "space-between";
      titleBar.style.alignItems = "center";
      
      // Título del gráfico
      const titleElement = document.createElement("h3");
      titleElement.textContent = config.title || `Gráfico ${instance.data.charts.length + 1}`;
      titleElement.style.margin = "0";
      titleElement.style.fontSize = "14px";
      titleElement.style.fontWeight = "500";
      
      // Botones de acción
      const actionButtons = document.createElement("div");
      actionButtons.className = "chart-actions";
      
      // Botón de opciones
      const optionsButton = document.createElement("button");
      optionsButton.innerHTML = "⚙️";
      optionsButton.style.border = "none";
      optionsButton.style.background = "none";
      optionsButton.style.cursor = "pointer";
      optionsButton.style.fontSize = "16px";
      optionsButton.title = "Configurar gráfico";
      
      // Botón de eliminar
      const removeButton = document.createElement("button");
      removeButton.innerHTML = "❌";
      removeButton.style.border = "none";
      removeButton.style.background = "none";
      removeButton.style.cursor = "pointer";
      removeButton.style.fontSize = "16px";
      removeButton.title = "Eliminar gráfico";
      
      // Eventos para botones
      optionsButton.addEventListener("click", () => {
        // Mostrar modal de configuración (implementado después)
        if (instance.data.showChartConfig) {
          instance.data.showChartConfig(chartId);
        }
      });
      
      removeButton.addEventListener("click", () => {
        // Eliminar gráfico
        instance.data.removeChart(chartId);
      });
      
      // Agregar botones al contenedor
      actionButtons.appendChild(optionsButton);
      actionButtons.appendChild(removeButton);
      
      // Agregar elementos a la barra de título
      titleBar.appendChild(titleElement);
      titleBar.appendChild(actionButtons);
      
      // Contenedor para el gráfico
      const chartContent = document.createElement("div");
      chartContent.className = "chart-content";
      chartContent.style.flex = "1";
      chartContent.style.position = "relative";
      
      // Agregar elementos al contenedor de gráfico
      chartContainer.appendChild(titleBar);
      chartContainer.appendChild(chartContent);
      
      // Agregar contenedor al dashboard
      instance.data.container.appendChild(chartContainer);
      
      // Registrar gráfico en la lista
      const chartInfo = {
        id: chartId,
        type: chartType,
        container: chartContainer,
        content: chartContent,
        position: position,
        dataSource: dataSource,
        config: config,
        title: titleElement
      };
      
      instance.data.charts.push(chartInfo);
      
      // Inicializar el gráfico
      instance.data.initializeChart(chartInfo);
      
      return chartId;
    };
    
    // Función para inicializar un gráfico dentro del dashboard
    instance.data.initializeChart = function(chartInfo) {
      // Crear un mini-gráfico dentro del dashboard
      // En lugar de usar ChartElement externo, reutilizamos nuestro propio código
      
      const uniqueId = chartInfo.content.id || "chart-content-" + (new Date().getTime());
      chartInfo.content.id = uniqueId;
      
      // Crear instancia de chart
      chartInfo.chartInstance = {
        data: {
          container: chartInfo.content,
          container_id: uniqueId,
          currentChartType: chartInfo.type,
          // Copia de funciones necesarias del ChartElement
          showLoadingState: instance.data.showLoadingState,
          showEmptyState: instance.data.showEmptyState,
          showErrorState: instance.data.showErrorState,
          renderPlotlyChart: instance.data.renderPlotlyChart,
          getColorScale: instance.data.getColorScale,
          imageManager: instance.data.imageManager,
          createExportButton: instance.data.createExportButton,
          applyExportButtonStyles: instance.data.applyExportButtonStyles,
          loadExportLibraries: instance.data.loadExportLibraries,
          extractPlotlyData: instance.data.extractPlotlyData,
          getLocale: instance.data.getLocale,
          loadPlotlyLocale: instance.data.loadPlotlyLocale,
          cache: {
            inputHash: "",
            result: null
          },
          // Nuevo: referencia al dashboard padre
          dashboardParent: instance
        }
      };
      
      // Mostrar estado de carga
      chartInfo.chartInstance.data.showLoadingState("auto");
      
      // Si tenemos datos de la fuente, renderizar el gráfico
      if (chartInfo.dataSource && Array.isArray(chartInfo.dataSource) && chartInfo.dataSource.length > 0) {
        // Procesamiento simplificado para el ejemplo
        let traces;
        
        // Verificar el tipo de datos y adaptarlos al tipo de gráfico
        if (chartInfo.type === 'pie' || chartInfo.type === 'donut') {
          traces = [{
            type: chartInfo.type,
            labels: chartInfo.dataSource.map(item => item.label || item.name || item.category),
            values: chartInfo.dataSource.map(item => item.value || item.count),
            hole: chartInfo.type === 'donut' ? 0.4 : 0,
            name: chartInfo.config.title || 'Serie 1'
          }];
        } else {
          // Para otros tipos de gráficos, usar formato x, y
          traces = [{
            type: chartInfo.type,
            x: chartInfo.dataSource.map(item => item.label || item.x || item.category),
            y: chartInfo.dataSource.map(item => item.value || item.y || item.count),
            name: chartInfo.config.title || 'Serie 1'
          }];
        }
        
        const layout = {
          title: {
            text: chartInfo.config.title || '',
            font: { size: 14 }
          },
          showlegend: chartInfo.config.showLegend !== false,
          autosize: true,
          margin: { t: 30, r: 10, l: 40, b: 30 }
        };
        
        const config = {
          responsive: true,
          displayModeBar: false,
          enableSync: true
        };
        
        // Renderizar el gráfico usando la función existente
        chartInfo.chartInstance.data.renderPlotlyChart(
          uniqueId,
          chartInfo.type || 'bar',
          traces,
          layout,
          config
        );
      } else {
        // Datos de ejemplo para visualización
        const sampleTraces = [{
          x: ['A', 'B', 'C', 'D', 'E'],
          y: [20, 14, 23, 18, 30],
          type: chartInfo.type || 'bar',
          name: 'Serie 1'
        }];
        
        const layout = {
          title: {
            text: chartInfo.config.title || '',
            font: { size: 14 }
          },
          showlegend: chartInfo.config.showLegend !== false,
          autosize: true,
          margin: { t: 30, r: 10, l: 40, b: 30 }
        };
        
        const config = {
          responsive: true,
          displayModeBar: false,
          enableSync: true
        };
        
        // Renderizar el gráfico usando la función existente
        chartInfo.chartInstance.data.renderPlotlyChart(
          uniqueId,
          chartInfo.type || 'bar',
          sampleTraces,
          layout,
          config
        );
      }
    };
    
    // Función para eliminar un gráfico
    instance.data.removeChart = function(chartId) {
      const index = instance.data.charts.findIndex(c => c.id === chartId);
      if (index !== -1) {
        const chart = instance.data.charts[index];
        
        // Eliminar del DOM
        if (chart.container && chart.container.parentNode) {
          chart.container.parentNode.removeChild(chart.container);
        }
        
        // Eliminar de la lista
        instance.data.charts.splice(index, 1);
        
        // Publicar evento de cambio
        instance.data.eventBus.publish('chart-removed', { chartId });
        
        // Disparar evento para Bubble
        if (instance.triggerEvent) {
          instance.triggerEvent('chart_removed', { chartId });
        }
        
        return true;
      }
      return false;
    };
    
    // Función para eliminar todos los gráficos
    instance.data.removeAllCharts = function() {
      // Copiar array para evitar problemas al modificar durante la iteración
      const chartsToRemove = [...instance.data.charts];
      chartsToRemove.forEach(chart => {
        instance.data.removeChart(chart.id);
      });
    };
    
    // Crear modal básico para configurar gráficos
    instance.data.showChartConfig = function(chartId) {
      const chartInfo = instance.data.charts.find(c => c.id === chartId);
      if (!chartInfo) return;
      
      const locale = instance.data.getLocale(instance.data.language || 'auto');
      
      // Crear modal
      const modal = document.createElement("div");
      modal.className = "dashboard-modal";
      modal.style.position = "fixed";
      modal.style.top = "0";
      modal.style.left = "0";
      modal.style.width = "100%";
      modal.style.height = "100%";
      modal.style.backgroundColor = "rgba(0,0,0,0.5)";
      modal.style.display = "flex";
      modal.style.alignItems = "center";
      modal.style.justifyContent = "center";
      modal.style.zIndex = "1000";
      
      // Contenido del modal
      const modalContent = document.createElement("div");
      modalContent.className = "dashboard-modal-content";
      modalContent.style.backgroundColor = "white";
      modalContent.style.borderRadius = "8px";
      modalContent.style.padding = "20px";
      modalContent.style.width = "400px";
      modalContent.style.maxWidth = "90%";
      modalContent.style.maxHeight = "90%";
      modalContent.style.overflow = "auto";
      modalContent.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)";
      
      // Título del modal
      const modalTitle = document.createElement("h2");
      modalTitle.textContent = locale.chartSettings;
      modalTitle.style.margin = "0 0 20px 0";
      modalTitle.style.fontSize = "18px";
      modalTitle.style.borderBottom = "1px solid #eaeaea";
      modalTitle.style.paddingBottom = "10px";
      
      // Formulario de configuración
      const form = document.createElement("form");
      form.style.display = "flex";
      form.style.flexDirection = "column";
      form.style.gap = "15px";
      
     // Campo de título
      const titleField = document.createElement("div");
      titleField.className = "form-field";
      
      const titleLabel = document.createElement("label");
      titleLabel.textContent = "Título";
      titleLabel.style.display = "block";
      titleLabel.style.marginBottom = "5px";
      titleLabel.style.fontWeight = "500";
      
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = chartInfo.config.title || "";
      titleInput.style.width = "100%";
      titleInput.style.padding = "8px";
      titleInput.style.border = "1px solid #ddd";
      titleInput.style.borderRadius = "4px";
      titleInput.style.boxSizing = "border-box";
      
      titleField.appendChild(titleLabel);
      titleField.appendChild(titleInput);
      
      // Campo de tipo de gráfico
      const typeField = document.createElement("div");
      typeField.className = "form-field";
      
      const typeLabel = document.createElement("label");
      typeLabel.textContent = locale.chartType;
      typeLabel.style.display = "block";
      typeLabel.style.marginBottom = "5px";
      typeLabel.style.fontWeight = "500";
      
      const typeSelect = document.createElement("select");
      typeSelect.style.width = "100%";
      typeSelect.style.padding = "8px";
      typeSelect.style.border = "1px solid #ddd";
      typeSelect.style.borderRadius = "4px";
      typeSelect.style.boxSizing = "border-box";
      
      // Opciones de tipo de gráfico
      const chartTypes = [
        { value: "bar", label: "Barras" },
        { value: "line", label: "Líneas" },
        { value: "area", label: "Área" },
        { value: "scatter", label: "Dispersión" },
        { value: "pie", label: "Pastel" },
        { value: "donut", label: "Donut" },
        { value: "heatmap", label: "Mapa de calor" }
      ];
      
      chartTypes.forEach(type => {
        const option = document.createElement("option");
        option.value = type.value;
        option.textContent = type.label;
        if (type.value === chartInfo.type) {
          option.selected = true;
        }
        typeSelect.appendChild(option);
      });
      
      typeField.appendChild(typeLabel);
      typeField.appendChild(typeSelect);
      
      // Campos de posición
      const positionField = document.createElement("div");
      positionField.className = "form-field";
      
      const positionLabel = document.createElement("label");
      positionLabel.textContent = locale.position;
      positionLabel.style.display = "block";
      positionLabel.style.marginBottom = "5px";
      positionLabel.style.fontWeight = "500";
      
      const positionInputs = document.createElement("div");
      positionInputs.style.display = "grid";
      positionInputs.style.gridTemplateColumns = "1fr 1fr";
      positionInputs.style.gap = "10px";
      
      // Ancho (columnas)
      const widthDiv = document.createElement("div");
      
      const widthLabel = document.createElement("label");
      widthLabel.textContent = locale.columnSpan;
      widthLabel.style.display = "block";
      widthLabel.style.marginBottom = "5px";
      widthLabel.style.fontSize = "12px";
      
      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "1";
      widthInput.max = "12";
      widthInput.value = chartInfo.position?.width || 3;
      widthInput.style.width = "100%";
      widthInput.style.padding = "8px";
      widthInput.style.border = "1px solid #ddd";
      widthInput.style.borderRadius = "4px";
      widthInput.style.boxSizing = "border-box";
      
      widthDiv.appendChild(widthLabel);
      widthDiv.appendChild(widthInput);
      
      // Alto (filas)
      const heightDiv = document.createElement("div");
      
      const heightLabel = document.createElement("label");
      heightLabel.textContent = locale.rowSpan;
      heightLabel.style.display = "block";
      heightLabel.style.marginBottom = "5px";
      heightLabel.style.fontSize = "12px";
      
      const heightInput = document.createElement("input");
      heightInput.type = "number";
      heightInput.min = "1";
      heightInput.max = "12";
      heightInput.value = chartInfo.position?.height || 2;
      heightInput.style.width = "100%";
      heightInput.style.padding = "8px";
      heightInput.style.border = "1px solid #ddd";
      heightInput.style.borderRadius = "4px";
      heightInput.style.boxSizing = "border-box";
      
      heightDiv.appendChild(heightLabel);
      heightDiv.appendChild(heightInput);
      
      positionInputs.appendChild(widthDiv);
      positionInputs.appendChild(heightDiv);
      
      positionField.appendChild(positionLabel);
      positionField.appendChild(positionInputs);
      
      // Botones de acción
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "10px";
      actions.style.marginTop = "20px";
      
      const cancelButton = document.createElement("button");
      cancelButton.textContent = locale.cancel;
      cancelButton.style.padding = "8px 16px";
      cancelButton.style.border = "1px solid #ddd";
      cancelButton.style.borderRadius = "4px";
      cancelButton.style.backgroundColor = "#f5f5f5";
      cancelButton.style.cursor = "pointer";
      
      const applyButton = document.createElement("button");
      applyButton.textContent = locale.applyChanges;
      applyButton.style.padding = "8px 16px";
      applyButton.style.border = "none";
      applyButton.style.borderRadius = "4px";
      applyButton.style.backgroundColor = "#4285F4";
      applyButton.style.color = "white";
      applyButton.style.cursor = "pointer";
      
      actions.appendChild(cancelButton);
      actions.appendChild(applyButton);
      
      // Agregar campos al formulario
      form.appendChild(titleField);
      form.appendChild(typeField);
      form.appendChild(positionField);
      form.appendChild(actions);
      
      // Agregar elementos al modal
      modalContent.appendChild(modalTitle);
      modalContent.appendChild(form);
      modal.appendChild(modalContent);
      
      // Eventos
      cancelButton.addEventListener("click", (e) => {
        e.preventDefault();
        document.body.removeChild(modal);
      });
      
      applyButton.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Actualizar configuración del gráfico
        chartInfo.config.title = titleInput.value;
        chartInfo.title.textContent = titleInput.value;
        
        // Actualizar tipo de gráfico si cambió
        if (typeSelect.value !== chartInfo.type) {
          chartInfo.type = typeSelect.value;
          // Reinicializar el gráfico
          instance.data.initializeChart(chartInfo);
        }
        
        // Actualizar posición
        const newWidth = parseInt(widthInput.value) || 3;
        const newHeight = parseInt(heightInput.value) || 2;
        
        chartInfo.position = {
          ...chartInfo.position,
          width: newWidth,
          height: newHeight
        };
        
        chartInfo.container.style.gridColumn = `span ${newWidth}`;
        chartInfo.container.style.gridRow = `span ${newHeight}`;
        
        // Cerrar modal
        document.body.removeChild(modal);
        
        // Publicar evento de cambio
        instance.data.eventBus.publish('chart-updated', { chartId });
        
        // Disparar evento para Bubble
        if (instance.triggerEvent) {
          instance.triggerEvent('chart_updated', { 
            chartId,
            type: chartInfo.type,
            title: chartInfo.config.title,
            position: chartInfo.position
          });
        }
      });
      
      // Cerrar modal al hacer clic fuera del contenido
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
      
      // Mostrar modal
      document.body.appendChild(modal);
    };
    
    // Crear botón para añadir gráficos
    instance.data.createAddChartButton = function() {
      const locale = instance.data.getLocale(instance.data.language || 'auto');
      
      const addButton = document.createElement("button");
      addButton.className = "add-chart-button";
      addButton.innerHTML = `+ ${locale.addChart}`;
      addButton.style.position = "absolute";
      addButton.style.bottom = "20px";
      addButton.style.right = "20px";
      addButton.style.padding = "10px 15px";
      addButton.style.backgroundColor = "#4285F4";
      addButton.style.color = "white";
      addButton.style.border = "none";
      addButton.style.borderRadius = "4px";
      addButton.style.cursor = "pointer";
      addButton.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
      addButton.style.zIndex = "900";
      
      addButton.addEventListener("click", () => {
        // Añadir gráfico con configuración por defecto
        const chartId = instance.data.addChart(
          'bar',
          { width: 4, height: 3 },
          [], // Datos de ejemplo
          { title: `Gráfico ${instance.data.charts.length + 1}` }
        );
        
        // Disparar evento para Bubble
        if (instance.triggerEvent) {
          instance.triggerEvent('chart_added', { chartId });
        }
      });
      
      instance.data.container.appendChild(addButton);
      instance.data.addButton = addButton;
    };
    
    // Modal para mostrar los ajustes globales del dashboard
    instance.data.showDashboardSettings = function() {
      // Implementación del modal de ajustes globales
      // (similar al modal de configuración de gráfico, pero con opciones del dashboard)
    };
    
    // Inicializar dashboard con configuración por defecto
    instance.data.applyGridConfig({
      columns: properties.grid_columns || 12,
      rowHeight: properties.grid_row_height || 200,
      gap: properties.grid_gap || 15,
      padding: properties.grid_padding || 20,
      responsive: properties.responsive !== false,
      breakpoints: {
        tablet: { columns: properties.tablet_columns || 6 },
        mobile: { columns: properties.mobile_columns || 2 }
      }
    });
    
    // Crear botón para añadir gráficos
    instance.data.createAddChartButton();
  } else {
    // Este es un gráfico individual, no un dashboard
    instance.data.isDashboard = false;
    
    // Añadir funcionalidad para comunicarse con un dashboard padre
    instance.data.registerWithDashboard = function(dashboardInstance) {
      instance.data.dashboardParent = dashboardInstance;
      
      // Registrar eventos
      if (dashboardInstance && dashboardInstance.eventBus) {
        // Suscribirse a eventos de filtros
        instance.data.filterUnsubscribe = dashboardInstance.eventBus.subscribe('chart-filter', (data) => {
          // No procesar eventos propios
          if (data.chartId === instance.data.container_id) return;
          
          // Aplicar filtro recibido de otro gráfico
          instance.data.applyExternalFilter(data.filter);
        });
        
        // Suscribirse a eventos de selección
        instance.data.selectionUnsubscribe = dashboardInstance.eventBus.subscribe('chart-click', (data) => {
          // No procesar eventos propios
          if (data.chartId === instance.data.container_id) return;
          
          // Resaltar datos relacionados
          instance.data.highlightRelatedData(data.data);
        });
      }
    };
    
    // Función para aplicar filtros externos
    instance.data.applyExternalFilter = function(filter) {
      // Implementación de filtrado específico según datos
      console.log("[ChartElement] Aplicando filtro externo:", filter);
      
      // Aquí implementarías la lógica para filtrar datos
      // Ejemplo simplificado:
      if (window.Plotly && filter && filter.type === 'legend' && filter.series) {
        const container = document.getElementById(instance.data.container_id);
        if (!container) return;
        
        // Obtener datos actuales
        const plotlyData = container.data;
        if (!plotlyData || !Array.isArray(plotlyData) || plotlyData.length === 0) return;
        
        // Aplicar filtro usando Plotly update
        Plotly.update(
          instance.data.container_id,
          // Actualizar trazos con filtro
          {
            // Ejemplo de filtrado: mantener visible solo los valores seleccionados
            visible: plotlyData.map(trace => 
              trace.name === filter.series ? true : 'legendonly'
            )
          }
        );
      }
    };
    
    // Función para resaltar datos relacionados
    instance.data.highlightRelatedData = function(data) {
      console.log("[ChartElement] Destacando datos relacionados:", data);
      
      // Implementación específica de resaltado
      if (window.Plotly && data && data.category) {
        const container = document.getElementById(instance.data.container_id);
        if (!container) return;
        
        // Obtener datos actuales
        const plotlyData = container.data;
        if (!plotlyData || !Array.isArray(plotlyData) || plotlyData.length === 0) return;
        
        // Encontrar puntos relacionados
        plotlyData.forEach((trace, traceIndex) => {
          if (trace.x && Array.isArray(trace.x)) {
            const pointIndex = trace.x.findIndex(x => x === data.category);
            
            if (pointIndex !== -1) {
              // Aplicar estilos de resaltado al punto
              Plotly.restyle(instance.data.container_id, {
                [`marker.size[${pointIndex}]`]: 15,
                [`marker.opacity[${pointIndex}]`]: 1,
                [`marker.color[${pointIndex}]`]: "#FF5722"
              }, [traceIndex]);
            }
          }
        });
        
        // Restaurar después de un tiempo
        setTimeout(() => {
          plotlyData.forEach((trace, traceIndex) => {
            if (trace.x && Array.isArray(trace.x)) {
              const pointIndex = trace.x.findIndex(x => x === data.category);
              
              if (pointIndex !== -1) {
                // Restaurar estilos
                Plotly.restyle(instance.data.container_id, {
                  [`marker.size[${pointIndex}]`]: 8,
                  [`marker.opacity[${pointIndex}]`]: 0.7,
                  [`marker.color[${pointIndex}]`]: undefined
                }, [traceIndex]);
              }
            }
          });
        }, 3000);
      }
    };
  }
  
  console.log("[ChartElement] Inicialización completa");
}