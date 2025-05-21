function(instance, properties, context) {
  console.log("[ChartElement] 🔄 Actualizando...");
  console.log("[DEBUG] Propiedades recibidas:", properties);
  console.log("[DEBUG] is_dashboard:", properties.is_dashboard);
  console.log("[DEBUG] chart_configs:", properties.chart_configs);

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

  // MANEJO DE DASHBOARD: Verificar si es un dashboard antes de procesar como gráfico normal
  if (instance.data.isDashboard) {
    console.log("[Dashboard] Actualizando dashboard...");
    console.log("[DEBUG] Detectado modo dashboard");
    
    // Guardar propiedad de lenguaje para uso en dashboard
    instance.data.language = properties.language || "auto";
    
    // Procesar configuración de gráficos con el helper - NUEVO
    if (!properties.chart_configs || properties.chart_configs.length === 0) {
      properties.chart_configs = buildChartConfigs(properties);
        console.log("[DEBUG] chart_configs después de buildChartConfigs:", properties.chart_configs);
    }
    
    // Actualizar configuración de grilla si cambió
    if (properties.grid_columns || properties.grid_row_height) {
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
    }
    
    // Procesar configuración de gráficos
    const chartConfigs = properties.chart_configs;
    
    // Si hay una configuración de gráficos y es válida
    if (chartConfigs && typeof chartConfigs.get === 'function') {
      // Si se debe resetear el dashboard
      if (properties.reset_dashboard) {
        instance.data.removeAllCharts();
      }
      
      // Obtener los gráficos configurados
      const configs = chartConfigs.get(0, chartConfigs.length());
      
      // Procesar cada configuración
      configs.forEach((config, index) => {
        // Verificar si ya existe este gráfico
        const existingChart = config.chart_id ? 
          instance.data.charts.find(c => c.id === config.chart_id) : 
          (index < instance.data.charts.length ? instance.data.charts[index] : null);
        
        if (existingChart) {
          // Actualizar gráfico existente
          if (existingChart.title) {
            existingChart.title.textContent = config.title || `Gráfico ${index + 1}`;
          }
          
          // Actualizar posición si cambió
          if (config.width || config.height || config.column || config.row) {
            const pos = {
              width: parseInt(config.width) || existingChart.position.width || 3,
              height: parseInt(config.height) || existingChart.position.height || 2,
              column: parseInt(config.column) || existingChart.position.column,
              row: parseInt(config.row) || existingChart.position.row
            };
            
            existingChart.container.style.gridColumn = `span ${pos.width}`;
            existingChart.container.style.gridRow = `span ${pos.height}`;
            
            if (pos.column !== undefined && pos.row !== undefined) {
              existingChart.container.style.gridColumnStart = pos.column;
              existingChart.container.style.gridRowStart = pos.row;
            }
            
            existingChart.position = pos;
          }
          
          // Actualizar configuración y datos solo si cambiaron
          let needsUpdate = false;
          
          // Verificar si el tipo de gráfico cambió
          if (config.chart_type && config.chart_type !== existingChart.type) {
            existingChart.type = config.chart_type;
            needsUpdate = true;
          }
          
          // Actualizar configuración
          if (config.chart_config) {
            existingChart.config = {
              ...existingChart.config,
              ...config.chart_config
            };
            needsUpdate = true;
          }
          
          // Actualizar datos si cambiaron o si se necesita actualizar por otros cambios
          if (config.data_source || needsUpdate) {
            if (config.data_source) {
              existingChart.dataSource = config.data_source;
            }
            
            // Reinicializar el gráfico
            instance.data.initializeChart(existingChart);
          }
        } else {
          // Crear nuevo gráfico
          const pos = {
            width: parseInt(config.width) || 3,
            height: parseInt(config.height) || 2,
            column: parseInt(config.column),
            row: parseInt(config.row)
          };
          
          instance.data.addChart(
            config.chart_type || 'bar',
            pos,
            config.data_source || [],
            {
              title: config.title || `Gráfico ${index + 1}`,
              ...(config.chart_config || {})
            }
          );
        }
      });
    }
    
    // Actualizar visibilidad del botón de añadir
    if (instance.data.addButton) {
      instance.data.addButton.style.display = properties.show_add_button === false ? 'none' : 'block';
    }
    
    // Permitir guardar el layout actual
    if (properties.save_layout_trigger) {
      const layout = instance.data.layoutManager.saveLayout();
      
      // Disparar evento para Bubble
      if (instance.triggerEvent) {
        instance.triggerEvent('layout_saved', { layout: JSON.stringify(layout) });
      }
    }
    
    // Cargar layout guardado
    if (properties.load_layout && properties.layout_data) {
      try {
        const layout = JSON.parse(properties.layout_data);
        const success = instance.data.layoutManager.loadLayout(layout);
        
        if (instance.triggerEvent) {
          instance.triggerEvent('layout_loaded', { success });
        }
      } catch (error) {
        console.error("[Dashboard] Error al cargar layout:", error);
        
        if (instance.triggerEvent) {
          instance.triggerEvent('layout_loaded', { success: false, error: error.message });
        }
      }
    }
    
    console.log("[Dashboard] Actualización completada");
    return; // Salir ya que este es un dashboard, no un gráfico individual
  }

  // Obtener propiedades
  const inputList = properties.input_data || properties.data_source;
  const rawX = properties.x_field;
  const rawY = properties.y_field; // Open para OHLC/Candlestick
  const rawZ = properties.z_field; // High para OHLC/Candlestick
  const rawLow = properties.low_field; // Nuevo campo para OHLC/Candlestick
  const rawClose = properties.close_field; // Nuevo campo para OHLC/Candlestick
  const rawSize = properties.bubble_size_field;
  const group1 = properties.primary_group_field;
  const group2 = properties.secondary_group_field;
  const method = properties.aggregation_method || "sum";
  const chartType = properties.chart_type || "bar";
  const title = properties.chart_title || "";
  const showLegend = properties.show_legend !== false; // Por defecto mostrar leyenda
  const normalizeLabels = properties.normalize_labels;
  const colors = properties.colors || [];
  const exportEnabled = properties.enable_export !== false; // Por defecto habilitado
  const template = properties.theme_template || "plotly";
  
  // Nuevas propiedades
  const language = properties.language || "auto"; // Idioma para localización
  const chartTheme = properties.chart_theme || "default"; // default, light, dark, minimal
  const enableInteractions = properties.enable_interactions !== false; // Por defecto habilitado
  const allowZoom = properties.allow_zoom !== false; // Por defecto habilitado
  const clickBehavior = properties.click_behavior || "none"; // none, highlight, filter
  const colorScale = properties.color_scale || "Viridis"; // Escala de colores para heatmap/contour
  
  // Propiedades de exportación
  const exportFormats = properties.export_formats || ["csv", "excel", "pdf", "image", "json"];
  const filenamePrefix = properties.filename_prefix || "chart";
  const pdfOrientation = properties.pdf_orientation || "portrait"; // portrait, landscape
  const buttonColor = properties.button_color || "#4285F4";
  const textColor = properties.text_color || "white";
  const buttonText = properties.button_text || "";
  const buttonIcon = properties.button_icon || "📊";
  
  // Nueva propiedad para colorway personalizado
  const colorwayString = properties.colorway || "";
  const colorway = colorwayString ? colorwayString.split(',').map(color => color.trim()) : [];

  // Propiedad para habilitar la sincronización con el dashboard
  const enableSync = properties.enable_sync !== false; // Por defecto habilitado

  // Mostrar estado de carga
  instance.data.showLoadingState(language);

  // Verificar datos de entrada
  if (!inputList || typeof inputList.get !== "function") {
    console.warn("[ChartElement] ❌ input_data inválido.");
    instance.data.showErrorState(language);
    return;
  }

  // DEPURACIÓN: Mostrar valores de propiedades de exportación
  console.log("[ChartElement] 🔍 Propiedades de exportación:");
  console.log("- exportEnabled:", exportEnabled);
  console.log("- exportFormats:", properties.export_formats);
  console.log("- filenamePrefix:", properties.filename_prefix);
  console.log("- pdfOrientation:", properties.pdf_orientation);
  console.log("- buttonColor:", properties.button_color);
  console.log("- textColor:", properties.text_color);
  console.log("- buttonText:", properties.button_text);
  console.log("- buttonIcon:", properties.button_icon);

  // Función auxiliar para convertir valores a números
  function parseNumericValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      // Eliminar caracteres no numéricos excepto puntos y signos negativos
      const cleanedValue = value.replace(/[^\d.-]/g, '');
      return parseFloat(cleanedValue);
    }
    return null;
  }

  // Generar hash para sistema de caché
  const inputHash = JSON.stringify({
    chartType,
    rawX,
    rawY,
    rawZ,
    rawLow,
    rawClose,
    group1,
    group2,
    method,
    normalizeLabels
  });
  
  // Función para resolver campos
  function resolveFieldName(name, props) {
    if (!name) return null;
    
    const suffixes = ["", "_text", "_number", "_date", "_boolean"];
    for (let suf of suffixes) {
      const candidate = name + suf;
      if (props.includes(candidate)) return candidate;
    }
    return null;
  }

  // Función para normalizar valores
  function normalizeValue(value) {
    if (!normalizeLabels || value === null || value === undefined) return value;
    if (typeof value === "string") return value.trim().toLowerCase();
    return value;
  }
  
  // Función auxiliar para formatear fechas según localización
  function formatDate(date, locale) {
    if (!(date instanceof Date)) return date;
    
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    
    // Formato corto: 15-Feb-2023
    return `${day}-${locale.monthsShort?.[month] || month+1}-${year}`;
  }

  // Función para crear layout con temas
  function createLayout() {
    // Definir temas básicos con colores atractivos
    const themes = {
      "default": {},
      "light": {
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#f8f9fa',
        font: { color: '#333333' },
        colorway: ['#4285F4', '#EA4335', '#34A853', '#FBBC05', '#8A4BFF', '#FF5722']
      },
      "dark": {
        paper_bgcolor: '#222222',
        plot_bgcolor: '#333333',
        font: { color: '#ffffff' },
        colorway: ['#8AB4F8', '#F28B82', '#81C995', '#FDD663', '#D7AEFB', '#FF9E80']
      },
      "minimal": {
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#ffffff',
        font: { color: '#333333' },
        colorway: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272']
      }
    };
    
    // Crear layout base
    const layout = {
      title: { 
        text: title, 
        font: { size: 16 },
        x: 0.05,
        y: 0.95
      },
      showlegend: showLegend,
      autosize: true,
      template: template,
      // Reducir márgenes para optimizar espacio
      margin: { t: 45, r: 15, l: 50, b: 65 },
      // Configuración para barras más anchas
      bargap: 0.15,
      bargroupgap: 0.1,
      // Aplicar tema seleccionado
      ...(themes[chartTheme] || {}),
      
      // Añadir uirevision con gestión automática
      // Esto preservará interacciones del usuario por defecto
      uirevision: properties.reset_view === true ? Date.now() : 'preserve_interactions',
      
      // Aplicar colorway personalizado si existe
      colorway: colorway.length > 0 ? colorway : undefined
    };
    
    // Ajustes específicos según tipo de gráfico
    if (["heatmap", "contour"].includes(chartType)) {
      // Aumentar margen derecho para dar espacio a la escala de color
      layout.margin.r = 70;
    }
    
    // Configuración para scatter si se activa group_by_x
    if (chartType === "scatter" && properties.group_by_x === true) {
      layout.scattermode = "group";
      layout.scattergap = properties.scatter_gap || 0.5;
    }
    
    return layout;
  }
  
  // Función para crear configuración
  function createConfig() {
    // Determinar el idioma a usar
    let locale = language;
    if (locale === 'auto') {
      locale = navigator.language || navigator.userLanguage;
      locale = locale.split('-')[0]; // Simplificar a código de 2 letras
    }
    
    // Verificar si hay datos para exportar
    const dataToExport = inputList ? inputList.get(0, inputList.length()) : [];
    console.log("[ChartElement] 🔍 Datos para exportación:", dataToExport);
    console.log("[ChartElement] 🔍 ¿Hay datos?:", dataToExport && dataToExport.length > 0);
    
    // Configuración con más propiedades explícitas
    const config = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      scrollZoom: allowZoom,
      modeBarButtonsToAdd: allowZoom ? ['zoom2d', 'pan2d', 'resetScale2d'] : [],
      enableInteractions: enableInteractions,
      clickBehavior: clickBehavior,
      locale: locale, // Usar el locale de Plotly
      
      // Propiedades de exportación explícitas
      enableExport: exportEnabled,
      exportFormats: exportFormats,
      filenamePrefix: filenamePrefix,
      pdfOrientation: pdfOrientation,
      buttonColor: buttonColor,
      textColor: textColor,
      buttonText: buttonText,
      buttonIcon: buttonIcon,
      language: language,
      
      // Habilitar sincronización con dashboard
      enableSync: enableSync,
      
      // Datos originales para exportación
      inputData: dataToExport
    };
    
    // Ajustes específicos para tipos de gráficos que necesitan más interactividad
    if (["heatmap", "contour"].includes(chartType)) {
      config.scrollZoom = true;
      config.modeBarButtonsToAdd = ['zoom2d', 'pan2d', 'resetScale2d', 'toImage'];
    }
    
    return config;
  }

  try {
    // Cargar el locale según la preferencia del usuario
    instance.data.loadPlotlyLocale(language || 'auto')
      .then(async (activeLocale) => {
        // Obtener y procesar datos
        const items = inputList.get(0, inputList.length());
        if (items.length === 0) {
          instance.data.showEmptyState(language);
          return;
        }

        // Usar caché si disponible
        if (instance.data.cache.inputHash === inputHash && instance.data.cache.result) {
          console.log("[ChartElement] ✅ Usando caché");
          const cachedResult = instance.data.cache.result;
          
          // Renderizar desde caché con nuevos estilos/tema
          const layout = createLayout();
          
          // Si sólo cambia el tema u otras propiedades cosméticas, mantener uirevision
          // para preservar interacciones del usuario (como zoom)
          if (!properties.reset_view) {
            layout.uirevision = 'preserve_interactions';
          }
          
          const config = createConfig();
          
          // Procesar configuración de imágenes
          let chartImages = [];

          // Logo corporativo (esquina superior derecha por defecto)
          if (properties.logo_url && properties.show_logo !== false) {
            const logoOptions = {
              sizex: properties.logo_size_x || 0.15,
              sizey: properties.logo_size_y || 0.15,
              opacity: properties.logo_opacity || 1
            };
            
            // Posición personalizada si se especifica
            if (properties.logo_position) {
              const position = properties.logo_position;
              switch (position) {
                case "top-left":
                  logoOptions.x = 0;
                  logoOptions.y = 1;
                  logoOptions.xanchor = "left";
                  logoOptions.yanchor = "top";
                  break;
                case "top-right": // Default
                  logoOptions.x = 1;
                  logoOptions.y = 1;
                  logoOptions.xanchor = "right";
                  logoOptions.yanchor = "top";
                  break;
                case "bottom-left":
                  logoOptions.x = 0;
                  logoOptions.y = 0;
                  logoOptions.xanchor = "left";
                  logoOptions.yanchor = "bottom";
                  break;
                case "bottom-right":
                  logoOptions.x = 1;
                  logoOptions.y = 0;
                  logoOptions.xanchor = "right";
                  logoOptions.yanchor = "bottom";
                  break;
                case "center":
                  logoOptions.x = 0.5;
                  logoOptions.y = 0.5;
                  logoOptions.xanchor = "center";
                  logoOptions.yanchor = "middle";
                  break;
              }
            }
            
            console.log("[ChartElement] 🔍 Creando logo con URL:", properties.logo_url);
            const logoConfig = instance.data.imageManager.createLogo(properties.logo_url, logoOptions);
            if (logoConfig) {
              chartImages.push(logoConfig);
              console.log("[ChartElement] ✅ Logo añadido a la configuración");
            }
          }

          // Marca de agua (centrada con baja opacidad por defecto)
          if (properties.watermark_url && properties.show_watermark !== false) {
            const watermarkOptions = {
              sizex: properties.watermark_size_x || 0.5,
              sizey: properties.watermark_size_y || 0.5,
              opacity: properties.watermark_opacity || 0.1
            };
            
            const watermarkConfig = instance.data.imageManager.createWatermark(properties.watermark_url, watermarkOptions);
            if (watermarkConfig) {
              chartImages.push(watermarkConfig);
            }
          }

          // Imagen de fondo
          if (properties.background_image_url && properties.show_background_image !== false) {
            const bgOptions = {
              opacity: properties.background_opacity || 0.05,
              sizing: properties.background_sizing || "stretch" // "stretch", "fill", "contain"
            };
            
            const bgConfig = instance.data.imageManager.createBackgroundImage(properties.background_image_url, bgOptions);
            if (bgConfig) {
              chartImages.push(bgConfig);
            }
          }

          // Imágenes decorativas personalizadas
          // Permite añadir hasta 3 imágenes decorativas
          for (let i = 1; i <= 3; i++) {
            const urlProp = `decorative_image_${i}_url`;
            const posProp = `decorative_image_${i}_position`;
            const sizexProp = `decorative_image_${i}_size_x`;
            const sizeyProp = `decorative_image_${i}_size_y`;
            const opacityProp = `decorative_image_${i}_opacity`;
            
            if (properties[urlProp]) {
              const imgOptions = {
                sizex: properties[sizexProp] || 0.1,
                sizey: properties[sizeyProp] || 0.1,
                opacity: properties[opacityProp] || 1
              };
              
              const position = properties[posProp] || "top-right";
              const imgConfig = instance.data.imageManager.createDecorativeImage(
                properties[urlProp], 
                position, 
                imgOptions
              );
              
              if (imgConfig) {
                chartImages.push(imgConfig);
              }
            }
          }

          // Si hay imágenes configuradas, añadirlas al config
          if (chartImages.length > 0) {
            console.log("[ChartElement] 🔍 Imágenes para gráfico:", chartImages.length);
            config.images = chartImages;
          }
          
          instance.data.renderPlotlyChart(
            instance.data.container_id, 
            chartType, 
            cachedResult.traces, 
            layout, 
            config
          );
          return;
        }

        // Procesar datos
        const props = items[0].listProperties();
        const resolvedX = resolveFieldName(rawX, props);
        const resolvedY = resolveFieldName(rawY, props);
        const resolvedZ = rawZ ? resolveFieldName(rawZ, props) : null;
        const resolvedLow = rawLow ? resolveFieldName(rawLow, props) : null;
        const resolvedClose = rawClose ? resolveFieldName(rawClose, props) : null;
        const resolvedSize = rawSize ? resolveFieldName(rawSize, props) : null;
        const resolvedG1 = group1 ? resolveFieldName(group1, props) : null;
        const resolvedG2 = group2 ? resolveFieldName(group2, props) : null;

        // Verificar campos
        console.log("[ChartElement] 🔍 Campos resueltos:");
        console.log("- X:", resolvedX);
        console.log("- Y:", resolvedY);
        console.log("- Z:", resolvedZ);
        console.log("- Grupo1:", resolvedG1);
        console.log("- Grupo2:", resolvedG2);

        if (!resolvedX || (!resolvedY && !["funnel_area"].includes(chartType))) {
          console.warn("[ChartElement] ❌ Campos no resueltos.");
          instance.data.showErrorState(language);
          return;
        }

        // Generar trazos según tipo de gráfico
        let traces;

        if (["ohlc", "candlestick"].includes(chartType)) {
          // Código para gráficos financieros
          // (esta parte permanece igual, se omite por brevedad)
          // ...
          
          // Verificar campos necesarios para gráficos financieros
          if (!resolvedY || !resolvedZ || !resolvedLow || !resolvedClose) {
            console.warn("[ChartElement] ❌ Se requieren campos Open, High, Low y Close para gráficos OHLC/Candlestick.");
            instance.data.showErrorState(language);
            return;
          }
          
          // Arrays para almacenar datos
          const xValues = [];
          const openValues = [];
          const highValues = [];
          const lowValues = [];
          const closeValues = [];
          
          // Recolectar valores OHLC
          items.forEach(item => {
            try {
              const x = item.get(resolvedX);
              
              // Obtener valores y convertirlos a número si son cadenas
              let open = item.get(resolvedY);
              let high = item.get(resolvedZ);
              let low = item.get(resolvedLow);
              let close = item.get(resolvedClose);
              
              // Convertir a números si son cadenas
              open = parseNumericValue(open);
              high = parseNumericValue(high);
              low = parseNumericValue(low);
              close = parseNumericValue(close);
              
              // Verificar que todos los valores son numéricos
              if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return;
              
              // Formatear valor X
              let xValue = x;
              if (x instanceof Date) {
                xValue = x.toISOString().split('T')[0]; // Formato YYYY-MM-DD
              } else if (typeof x === "string" && x.includes(",")) {
                // Intentar analizar formatos de fecha comunes
                try {
                  const date = new Date(x);
                  if (!isNaN(date.getTime())) {
                    xValue = date.toISOString().split('T')[0];
                  }
                } catch(e) {
                  // Usar el valor original si no se puede convertir
                }
              }
              
              xValues.push(xValue);
              openValues.push(open);
              highValues.push(high);
              lowValues.push(low);
              closeValues.push(close);
            } catch (error) {
              console.warn("[ChartElement] Error procesando item:", error);
            }
          });
          
          // Verificar que tenemos suficientes datos
          if (xValues.length === 0) {
            console.warn("[ChartElement] ❌ No hay suficientes datos para el gráfico financiero.");
            instance.data.showEmptyState(language);
            return;
          }
          
          // Crear trace para OHLC/Candlestick
          traces = [{
            x: xValues,
            open: openValues,
            high: highValues,
            low: lowValues,
            close: closeValues,
            type: chartType
          }];
        }
        else if (chartType === "waterfall") {
          // Código para gráficos waterfall
          // (esta parte permanece igual, se omite por brevedad) 
          // ...

          // Verificar campos necesarios
          if (!resolvedX || !resolvedY) {
            console.warn("[ChartElement] ❌ Se requieren campos X e Y para gráficos Waterfall.");
            instance.data.showErrorState(language);
            return;
          }
          
          // Arrays para almacenar datos
          const xValues = [];
          const yValues = [];
          const measures = [];
          
          // Valores iniciales y totales para cálculos
          let total = 0;
          let firstValue = null;
          
          // Recolectar valores para waterfall
          items.forEach((item, index) => {
            try {
              const x = item.get(resolvedX);
              const yRaw = item.get(resolvedY);
              const isMeasure = resolvedZ ? item.get(resolvedZ) : null; // Opcional para marcar totales
              
              // Convertir a número si es texto
              const y = parseNumericValue(yRaw);
              
              // Ignorar valores no numéricos
              if (y === null || isNaN(y)) return;
              
              // Guardar primer valor para referencia
              if (index === 0) firstValue = y;
              
              let measure = "relative";
              if (isMeasure === "total" || isMeasure === "absolute" || 
                  (index === 0 && firstValue !== null)) {
                measure = "absolute";
              } else if (index === items.length - 1) {
                measure = "total";
              }
              
              xValues.push(x);
              yValues.push(y);
              measures.push(measure);
              
              // Actualizar total
              if (measure === "relative") total += y;
            } catch (error) {
              console.warn("[ChartElement] Error procesando item:", error);
            }
          });
          
          // Verificar que tenemos suficientes datos
          if (xValues.length === 0) {
            console.warn("[ChartElement] ❌ No hay suficientes datos para Waterfall.");
            instance.data.showEmptyState(language);
            return;
          }
          
          // Crear trace para Waterfall
          traces = [{
            type: "waterfall",
            x: xValues,
            y: yValues,
            measure: measures,
            connector: { line: { color: "rgb(63, 63, 63)" } }
          }];
        }
        else if (chartType === "funnel_area") {
          // Código para gráficos funnel area
          // (esta parte permanece igual, se omite por brevedad)
          // ...

          // Para funnel area necesitamos categorías y valores
          const values = [];
          const labels = [];
          
          // Recolectar valores
          items.forEach(item => {
            try {
              const label = item.get(resolvedX);
              const valueRaw = item.get(resolvedY);
              
              // Convertir a número si es texto
              const value = parseNumericValue(valueRaw);
              
              // Ignorar valores no válidos
              if (!label || value === null || isNaN(value)) return;
              
              labels.push(label);
              values.push(value);
            } catch (error) {
              console.warn("[ChartElement] Error procesando item:", error);
            }
          });
          
          // Verificar que tenemos suficientes datos
          if (labels.length === 0 || values.length === 0) {
            console.warn("[ChartElement] ❌ No hay suficientes datos para Funnel Area.");
            instance.data.showEmptyState(language);
            return;
          }
          
          // Crear trace para Funnel Area
          traces = [{
            type: "funnelarea",
            values: values,
            labels: labels,
            textinfo: "value+percent",
            marker: { 
              // Usar colorway personalizado si existe
              colors: colorway.length > 0 ? colorway : colors 
            }
          }];
        }
        else if (["heatmap", "contour"].includes(chartType)) {
          // Código para gráficos heatmap y contour
          // (esta parte permanece igual, se omite por brevedad)
          // ...
          
          // Estos tipos necesitan una estructura de datos diferente
          // Verificamos si tenemos suficientes campos
          if (!resolvedZ) {
            console.warn("[ChartElement] ❌ Se requiere un campo Z para gráficos de heatmap/contour.");
            instance.data.showErrorState(language);
            return;
          }
          
          // Procesamos los datos en formato de matriz
          const xValues = [];
          const yValues = [];
          const zData = {};
          
          // Recolectar valores únicos para X e Y
          items.forEach(item => {
            const x = normalizeValue(item.get(resolvedX));
            const y = normalizeValue(item.get(resolvedY));
            const zRaw = item.get(resolvedZ);
            
            // Convertir Z a número si es texto
            const z = parseNumericValue(zRaw);
            
            if (z === null || isNaN(z)) return;
            
            if (!xValues.includes(x)) xValues.push(x);
            if (!yValues.includes(y)) yValues.push(y);
            
            // Almacenar en formato de coordenadas
            if (!zData[y]) zData[y] = {};
            zData[y][x] = z;
          });
          
          // Ordenar valores numéricamente, no alfabéticamente
          xValues.sort((a, b) => {
            const numA = parseNumericValue(a);
            const numB = parseNumericValue(b);
            
            if (numA !== null && !isNaN(numA) && numB !== null && !isNaN(numB)) {
              return numA - numB;
            }
            
            return String(a).localeCompare(String(b));
          });
          
          yValues.sort((a, b) => {
            const numA = parseNumericValue(a);
            const numB = parseNumericValue(b);
            
            if (numA !== null && !isNaN(numA) && numB !== null && !isNaN(numB)) {
              return numA - numB;
            }
            
            return String(a).localeCompare(String(b));
          });
          
          // Crear matriz Z
          const zMatrix = yValues.map(y => {
            return xValues.map(x => {
              return zData[y] && zData[y][x] !== undefined ? zData[y][x] : null;
            });
          });
          
          // Crear un único trace con configuraciones mejoradas
          traces = [{
            x: xValues,
            y: yValues,
            z: zMatrix,
            colorscale: instance.data.getColorScale ? instance.data.getColorScale(colorScale) : colorScale,
            type: chartType,
            showscale: true
          }];
          
          // Configuraciones específicas para contorno
          if (chartType === "contour") {
            traces[0].contours = {
              coloring: 'heatmap',
              showlabels: true,
              labelfont: {
                size: 12,
                color: chartTheme === "dark" ? "white" : "black"
              }
            };
            
            // Añadir suavizado para mejorar la apariencia visual
            traces[0].line = {
              smoothing: 0.85
            };
          }
        } 
        else if (["histogram2d", "histogram2dcontour"].includes(chartType)) {
          // Código para gráficos histogram2d y histogram2dcontour
          // (esta parte permanece igual, se omite por brevedad)
          // ...

          // Estos tipos necesitan las coordenadas X e Y directamente
          const xValues = [];
          const yValues = [];
          
          // Recolectar pares de valores X-Y
          items.forEach(item => {
            try {
              const xRaw = item.get(resolvedX);
              const yRaw = item.get(resolvedY);
              
              // Convertir a números
              const x = parseNumericValue(xRaw);
              const y = parseNumericValue(yRaw);
              
              // Solo incluir valores válidos
              if (x !== null && !isNaN(x) && y !== null && !isNaN(y)) {
                xValues.push(x);
                yValues.push(y);
              }
            } catch (error) {
              console.warn("[ChartElement] Error procesando item:", error);
            }
          });
          
          // Verificar que tenemos suficientes datos
          if (xValues.length > 0 && yValues.length > 0) {
            traces = [{
              x: xValues,
              y: yValues,
              colorscale: instance.data.getColorScale ? instance.data.getColorScale(colorScale) : colorScale,
              type: chartType,
              showscale: true
            }];
            
            // Añadir configuraciones específicas para histogram2dcontour
            if (chartType === "histogram2dcontour") {
              traces[0].contours = {
                showlabels: true,
                coloring: 'heatmap',
                labelfont: {
                  size: 12,
                  color: chartTheme === "dark" ? "white" : "black"
                }
              };
            }
          } else {
            console.warn("[ChartElement] ❌ No hay suficientes datos para histogram2d/histogram2dcontour.");
            instance.data.showEmptyState(language);
            return;
          }
        }
        else {
          // Código para otros tipos de gráficos
          // (esta parte permanece igual, se omite por brevedad)
          // ...

          // Procesamiento optimizado de datos para otros tipos de gráficos
          const dataMap = new Map();
          const uniqueLabels = new Set();
          const locale = instance.data.getLocale(language);
          
          // Procesar filas de datos
          items.forEach(item => {
            try {
              const xRaw = item.get(resolvedX);
              const yRaw = item.get(resolvedY);
              const sRaw = resolvedSize ? item.get(resolvedSize) : yRaw;
              
              // Convertir a número si es texto
              const y = parseNumericValue(yRaw);
              const s = parseNumericValue(sRaw);
              
              // Ignorar filas sin valores numéricos en Y para la mayoría de los gráficos
              if ((y === null || isNaN(y)) && !["pie", "donut", "doughnut"].includes(chartType)) return;
              
              // Formatear valor X
              let x = xRaw;
              if (xRaw instanceof Date) {
                // Usar localización para fechas
                x = formatDate(xRaw, locale);
              } else if (normalizeLabels && typeof xRaw === "string") {
                x = xRaw.trim().toLowerCase();
              }
              
              // Obtener grupos
              const g1Raw = resolvedG1 ? item.get(resolvedG1) : null;
              const g2Raw = resolvedG2 ? item.get(resolvedG2) : null;
              
              const g1 = normalizeLabels && typeof g1Raw === "string" ? g1Raw.trim().toLowerCase() : g1Raw;
              const g2 = normalizeLabels && typeof g2Raw === "string" ? g2Raw.trim().toLowerCase() : g2Raw;
              
              const groupKey = g1 || "Serie 1";
              const category = g2 || x;
              
              // Guardar etiqueta única
              uniqueLabels.add(category);
              
              // Agregar al mapa de datos
              if (!dataMap.has(groupKey)) {
                dataMap.set(groupKey, new Map());
              }
              
              if (!dataMap.get(groupKey).has(category)) {
                dataMap.get(groupKey).set(category, []);
              }
              
              dataMap.get(groupKey).get(category).push({
                y: y,
                size: s !== null && !isNaN(s) ? s : y
              });
            } catch (error) {
              console.warn("[ChartElement] Error procesando item:", error);
            }
          });
          
          // Convertir labels a array y ordenar
          const labels = Array.from(uniqueLabels);
          
          // Función para agregar valores
          function aggregate(values, method, field = "y") {
            const nums = values.map(v => v[field]).filter(v => typeof v === "number");
            if (nums.length === 0) return 0;
            switch (method) {
              case "sum": return nums.reduce((a, b) => a + b, 0);
              case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
              case "count": return nums.length;
              case "max": return Math.max(...nums);
              case "min": return Math.min(...nums);
              default: return 0;
            }
          }
          
          // Generar trazos según tipo de gráfico
          if (["pie", "donut", "doughnut"].includes(chartType)) {
            const values = labels.map(lbl => 
              Array.from(dataMap.values()).reduce((sum, g) => 
                sum + (g.has(lbl) ? aggregate(g.get(lbl), method) : 0), 0)
            );
            traces = [{ 
              labels, 
              values,
              textinfo: "percent+label",
              insidetextorientation: "radial",
              // Usar colorway personalizado si existe
              marker: { 
                colors: colorway.length > 0 ? colorway : colors 
              }
            }];
          } else if (chartType === "radar") {
            traces = Array.from(dataMap.entries()).map(([serie, data], idx) => ({
              r: labels.map(lbl => data.has(lbl) ? aggregate(data.get(lbl), method) : 0),
              theta: labels,
              name: serie,
              marker: { color: colors[idx] || undefined },
              line: { width: 3 }
            }));
          } else if (chartType === "bubble") {
            traces = Array.from(dataMap.entries()).map(([serie, data], idx) => ({
              x: labels,
              y: labels.map(lbl => data.has(lbl) ? aggregate(data.get(lbl), method, "y") : 0),
              sizes: labels.map(lbl => data.has(lbl) ? aggregate(data.get(lbl), method, "size") : 0).map(s => Math.max(s, 5)),
              name: serie,
              marker: { 
                color: colors[idx] || undefined,
                opacity: 0.7
              }
            }));
          } else if (["box", "violin", "histogram"].includes(chartType)) {
            traces = Array.from(dataMap.entries()).map(([serie, data], idx) => {
              // Aplanar datos para gráficos de distribución
              const allValues = [];
              data.forEach((values, key) => {
                values.forEach(v => {
                  if (typeof v.y === "number") allValues.push(v.y);
                });
              });
              
              return {
                y: allValues,
                name: serie,
                marker: { color: colors[idx] || undefined }
              };
            });
          } else if (chartType === "scatter") {
            // Implementación mejorada para scatter con modo configurable
            traces = Array.from(dataMap.entries()).map(([serie, data], idx) => ({
              x: labels,
              y: labels.map(lbl => data.has(lbl) ? aggregate(data.get(lbl), method) : 0),
              name: serie,
              // Añadir mode directamente al trace
              mode: properties.scatter_mode || "markers", // Usar la propiedad scatter_mode
              marker: { 
                color: colors[idx] || undefined,
                size: 8
              }
            }));
          } else {
            traces = Array.from(dataMap.entries()).map(([serie, data], idx) => ({
              x: labels,
              y: labels.map(lbl => data.has(lbl) ? aggregate(data.get(lbl), method) : 0),
              name: serie,
              marker: { 
                color: colors[idx] || undefined,
                size: 8
              }
            }));
          }
        }
        
        // Verificar que los trazos son válidos
        if (!traces || !Array.isArray(traces) || traces.length === 0) {
          console.warn("[ChartElement] ❌ No se generaron trazos válidos para el gráfico.");
          instance.data.showEmptyState(language);
          return;
        }
        
        // Guardar en caché
        instance.data.cache.inputHash = inputHash;
        instance.data.cache.result = { traces };
        
        // Renderizar gráfico
        const layout = createLayout();
        const config = createConfig();
        
        // Procesar configuración de imágenes
        let chartImages = [];

        // Logo corporativo (esquina superior derecha por defecto)
        if (properties.logo_url && properties.show_logo !== false) {
          const logoOptions = {
            sizex: properties.logo_size_x || 0.15,
            sizey: properties.logo_size_y || 0.15,
            opacity: properties.logo_opacity || 1
          };
          
          // Posición personalizada si se especifica
          if (properties.logo_position) {
            const position = properties.logo_position;
            switch (position) {
              case "top-left":
                logoOptions.x = 0;
                logoOptions.y = 1;
                logoOptions.xanchor = "left";
                logoOptions.yanchor = "top";
                break;
              case "top-right": // Default
                logoOptions.x = 1;
                logoOptions.y = 1;
                logoOptions.xanchor = "right";
                logoOptions.yanchor = "top";
                break;
              case "bottom-left":
                logoOptions.x = 0;
                logoOptions.y = 0;
                logoOptions.xanchor = "left";
                logoOptions.yanchor = "bottom";
                break;
              case "bottom-right":
                logoOptions.x = 1;
                logoOptions.y = 0;
                logoOptions.xanchor = "right";
                logoOptions.yanchor = "bottom";
                break;
              case "center":
                logoOptions.x = 0.5;
                logoOptions.y = 0.5;
                logoOptions.xanchor = "center";
                logoOptions.yanchor = "middle";
                break;
            }
          }
          
          console.log("[ChartElement] 🔍 Creando logo con URL:", properties.logo_url);
          const logoConfig = instance.data.imageManager.createLogo(properties.logo_url, logoOptions);
          if (logoConfig) {
            chartImages.push(logoConfig);
            console.log("[ChartElement] ✅ Logo añadido a la configuración");
          }
        }

        // Marca de agua (centrada con baja opacidad por defecto)
        if (properties.watermark_url && properties.show_watermark !== false) {
          const watermarkOptions = {
            sizex: properties.watermark_size_x || 0.5,
            sizey: properties.watermark_size_y || 0.5,
            opacity: properties.watermark_opacity || 0.1
          };
          
          const watermarkConfig = instance.data.imageManager.createWatermark(properties.watermark_url, watermarkOptions);
          if (watermarkConfig) {
            chartImages.push(watermarkConfig);
          }
        }

        // Imagen de fondo
        if (properties.background_image_url && properties.show_background_image !== false) {
          const bgOptions = {
            opacity: properties.background_opacity || 0.05,
            sizing: properties.background_sizing || "stretch" // "stretch", "fill", "contain"
          };
          
          const bgConfig = instance.data.imageManager.createBackgroundImage(properties.background_image_url, bgOptions);
          if (bgConfig) {
            chartImages.push(bgConfig);
          }
        }

        // Imágenes decorativas personalizadas
        // Permite añadir hasta 3 imágenes decorativas
        for (let i = 1; i <= 3; i++) {
          const urlProp = `decorative_image_${i}_url`;
          const posProp = `decorative_image_${i}_position`;
          const sizexProp = `decorative_image_${i}_size_x`;
          const sizeyProp = `decorative_image_${i}_size_y`;
          const opacityProp = `decorative_image_${i}_opacity`;
          
          if (properties[urlProp]) {
            const imgOptions = {
              sizex: properties[sizexProp] || 0.1,
              sizey: properties[sizeyProp] || 0.1,
              opacity: properties[opacityProp] || 1
            };
            
            const position = properties[posProp] || "top-right";
            const imgConfig = instance.data.imageManager.createDecorativeImage(
              properties[urlProp], 
              position, 
              imgOptions
            );
            
            if (imgConfig) {
              chartImages.push(imgConfig);
            }
          }
        }

        // Si hay imágenes configuradas, añadirlas al config
        if (chartImages.length > 0) {
          console.log("[ChartElement] 🔍 Imágenes para gráfico:", chartImages.length);
          config.images = chartImages;
        }
        
        instance.data.renderPlotlyChart(
          instance.data.container_id, 
          chartType, 
          traces, 
          layout, 
          config
        );
      })
      .catch(error => {
        console.error("[ChartElement] Error cargando locale:", error);
        instance.data.showErrorState(language);
      });

  } catch (e) {
    if (e.message === "not ready") {
      console.warn("[ChartElement] 🕒 Datos no listos.");
      throw e;
    }
    console.error("[ChartElement] ❌ Error en update:", e);
    instance.data.showErrorState(language);
  }
}