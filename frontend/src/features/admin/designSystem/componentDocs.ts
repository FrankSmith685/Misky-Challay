/**
 * REGISTRO DE DOCUMENTACION DE COMPONENTES (Material UI).
 *
 * Metadatos que alimentan la ficha profesional de cada componente en el Sistema
 * de Diseno: que hace, sobre que esta construido, cuando usarlo y su tabla de
 * props principales. La demo en vivo la pone cada seccion de la pagina.
 *
 * NOTA: los datos se generaron y verificaron con agentes; editar aqui es seguro.
 */
export type PropDoc = {
  /** Nombre de la prop (ej. "variant"). */
  name: string;
  /** Tipo en sintaxis TypeScript (ej. "'contained' | 'outlined' | 'text'"). */
  type: string;
  /** Valor por defecto como texto; cadena vacia si no tiene. */
  default: string;
  /** Para que sirve la prop. */
  description: string;
};

export type ComponentDocMeta = {
  /** Identificador estable, usado por <ComponentDoc docId="..." />. */
  id: string;
  /** Nombre publico del componente (ej. "Button"). */
  name: string;
  /** De donde se importa (casi siempre "@mui/material"). */
  import: string;
  /** Sobre que se construye / elemento raiz (ej. "ButtonBase -> <button>"). */
  builtOn: string;
  /** Que hace y para que sirve. */
  description: string;
  /** Cuando usarlo frente a alternativas. */
  whenToUse: string;
  /** Props mas usadas (5-9). */
  props: PropDoc[];
};

/** Fichas de todos los componentes, indexadas por id. */
export const COMPONENT_DOCS: Record<string, ComponentDocMeta> = {
  "textfield": {
    "id": "textfield",
    "name": "Input",
    "import": "@components/ui",
    "builtOn": "FormControl + InputLabel + OutlinedInput/FilledInput/Input + FormHelperText",
    "description": "Campo de entrada de texto de una sola linea que agrupa label, input y texto de ayuda en un solo componente. Es el control base para capturar datos como nombres, correos o cantidades en formularios.",
    "whenToUse": "Usalo para entrada de texto corta; usa TextField multiline para parrafos y Autocomplete cuando el usuario elige entre opciones existentes.",
    "props": [
      {
        "name": "variant",
        "type": "'outlined' | 'filled' | 'standard'",
        "default": "'outlined'",
        "description": "Estilo visual del campo: con borde, relleno o solo linea inferior."
      },
      {
        "name": "label",
        "type": "ReactNode",
        "default": "",
        "description": "Etiqueta flotante que describe el campo y se anima al enfocar o rellenar."
      },
      {
        "name": "value",
        "type": "unknown",
        "default": "",
        "description": "Valor controlado del input; usalo junto a onChange para manejarlo en el estado."
      },
      {
        "name": "onChange",
        "type": "(e) => void",
        "default": "",
        "description": "Se dispara en cada cambio; recibe el evento con e.target.value."
      },
      {
        "name": "type",
        "type": "string",
        "default": "'text'",
        "description": "Tipo del input HTML (text, password, email, number, tel, etc.)."
      },
      {
        "name": "error",
        "type": "boolean",
        "default": "false",
        "description": "Pinta el campo en color de error para indicar validacion fallida."
      },
      {
        "name": "helperText",
        "type": "ReactNode",
        "default": "",
        "description": "Texto auxiliar bajo el campo; suele mostrar el mensaje de error o una pista."
      },
      {
        "name": "fullWidth",
        "type": "boolean",
        "default": "false",
        "description": "Hace que el campo ocupe todo el ancho de su contenedor."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el campo impidiendo su edicion e interaccion."
      }
    ]
  },
  "textarea": {
    "id": "textarea",
    "name": "Textarea",
    "import": "@components/ui",
    "builtOn": "TextField con multiline; renderiza TextareaAutosize (o un <textarea> simple si se fija rows)",
    "description": "Variante de TextField que renderiza un area de texto multilinea para contenido largo como comentarios, descripciones o notas. Puede crecer automaticamente segun el contenido.",
    "whenToUse": "Usalo cuando esperas varias lineas de texto; para una sola linea usa el TextField normal.",
    "props": [
      {
        "name": "multiline",
        "type": "boolean",
        "default": "false",
        "description": "Activa el modo area de texto renderizando un <textarea> en lugar de <input>."
      },
      {
        "name": "rows",
        "type": "number | string",
        "default": "",
        "description": "Numero fijo de filas visibles; desactiva el auto-crecimiento."
      },
      {
        "name": "minRows",
        "type": "number | string",
        "default": "",
        "description": "Filas minimas visibles cuando el area crece automaticamente."
      },
      {
        "name": "maxRows",
        "type": "number | string",
        "default": "",
        "description": "Filas maximas antes de mostrar scroll interno."
      },
      {
        "name": "value",
        "type": "unknown",
        "default": "",
        "description": "Valor controlado del area de texto."
      },
      {
        "name": "onChange",
        "type": "(e) => void",
        "default": "",
        "description": "Se dispara en cada cambio del contenido; recibe el evento con e.target.value."
      },
      {
        "name": "label",
        "type": "ReactNode",
        "default": "",
        "description": "Etiqueta flotante que describe el campo."
      },
      {
        "name": "fullWidth",
        "type": "boolean",
        "default": "false",
        "description": "Ocupa todo el ancho disponible del contenedor."
      }
    ]
  },
  "select": {
    "id": "select",
    "name": "Select",
    "import": "@components/ui",
    "builtOn": "FormControl + OutlinedInput/FilledInput/Input + Menu (Popover) para el desplegable; MenuItem como opciones",
    "description": "Menu desplegable que permite elegir uno o varios valores de una lista predefinida. Se usa con componentes MenuItem como opciones y admite integrarse en un TextField mediante la prop select.",
    "whenToUse": "Usalo para pocas opciones fijas; usa Autocomplete cuando hay muchas opciones o se necesita busqueda, y RadioGroup cuando conviene mostrarlas todas.",
    "props": [
      {
        "name": "value",
        "type": "unknown | unknown[]",
        "default": "",
        "description": "Valor(es) seleccionado(s); usa un array cuando multiple es true."
      },
      {
        "name": "onChange",
        "type": "(e, child) => void",
        "default": "",
        "description": "Se dispara al elegir una opcion; recibe el evento con e.target.value."
      },
      {
        "name": "label",
        "type": "ReactNode",
        "default": "",
        "description": "Etiqueta del control; debe coincidir con InputLabel para reservar el espacio del borde."
      },
      {
        "name": "multiple",
        "type": "boolean",
        "default": "false",
        "description": "Permite seleccionar varios valores a la vez."
      },
      {
        "name": "renderValue",
        "type": "(value) => ReactNode",
        "default": "",
        "description": "Personaliza como se muestra el valor seleccionado en el campo cerrado."
      },
      {
        "name": "defaultValue",
        "type": "unknown",
        "default": "",
        "description": "Valor inicial cuando el Select se usa de forma no controlada."
      },
      {
        "name": "displayEmpty",
        "type": "boolean",
        "default": "false",
        "description": "Muestra el placeholder aunque el valor este vacio."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el desplegable impidiendo la seleccion."
      },
      {
        "name": "error",
        "type": "boolean",
        "default": "false",
        "description": "Aplica el estilo de error al borde del control (heredada de OutlinedInput)."
      }
    ]
  },
  "checkbox": {
    "id": "checkbox",
    "name": "Checkbox",
    "import": "@components/ui",
    "builtOn": "SwitchBase (ButtonBase) + SvgIcon (iconos check)",
    "description": "Casilla de verificacion para activar o desactivar una opcion booleana de forma independiente. Admite un estado intermedio (indeterminate) util para selecciones parciales.",
    "whenToUse": "Usalo para opciones on/off independientes o seleccion multiple en una lista; usa Radio cuando solo se puede elegir una opcion y Switch para ajustes de aplicacion inmediata.",
    "props": [
      {
        "name": "checked",
        "type": "boolean",
        "default": "",
        "description": "Estado marcado en modo controlado; usalo junto a onChange."
      },
      {
        "name": "onChange",
        "type": "(e, checked) => void",
        "default": "",
        "description": "Se dispara al alternar; recibe el evento y el nuevo estado booleano."
      },
      {
        "name": "defaultChecked",
        "type": "boolean",
        "default": "false",
        "description": "Estado inicial marcado cuando se usa de forma no controlada."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'default'",
        "default": "'primary'",
        "description": "Color de la casilla cuando esta marcada."
      },
      {
        "name": "size",
        "type": "'small' | 'medium'",
        "default": "'medium'",
        "description": "Tamano del control."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita la casilla impidiendo su interaccion."
      },
      {
        "name": "indeterminate",
        "type": "boolean",
        "default": "false",
        "description": "Muestra el estado intermedio, util cuando solo algunos hijos estan seleccionados."
      },
      {
        "name": "checkedIcon",
        "type": "ReactNode",
        "default": "",
        "description": "Icono personalizado que se muestra cuando esta marcada."
      }
    ]
  },
  "radio": {
    "id": "radio",
    "name": "RadioGroup",
    "import": "@components/ui",
    "builtOn": "RadioGroup (FormGroup + Context) + Radio (SwitchBase + SvgIcon)",
    "description": "Grupo de botones de opcion que permite elegir un unico valor de un conjunto mutuamente excluyente. RadioGroup gestiona el valor comun y cada Radio representa una opcion.",
    "whenToUse": "Usalo cuando hay pocas opciones excluyentes y conviene verlas todas; usa Select para listas largas y Checkbox cuando se pueden elegir varias.",
    "props": [
      {
        "name": "value",
        "type": "unknown",
        "default": "",
        "description": "Valor seleccionado del grupo (prop de RadioGroup), controlado con onChange."
      },
      {
        "name": "onChange",
        "type": "(e, value) => void",
        "default": "",
        "description": "Se dispara al cambiar la opcion del grupo; recibe el nuevo valor (RadioGroup)."
      },
      {
        "name": "name",
        "type": "string",
        "default": "",
        "description": "Nombre compartido por todos los radios del grupo para agruparlos (RadioGroup)."
      },
      {
        "name": "row",
        "type": "boolean",
        "default": "false",
        "description": "Distribuye las opciones en horizontal en lugar de vertical (RadioGroup)."
      },
      {
        "name": "defaultValue",
        "type": "unknown",
        "default": "",
        "description": "Valor inicial del grupo en modo no controlado (RadioGroup)."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'default'",
        "default": "'primary'",
        "description": "Color del boton de opcion cuando esta seleccionado (Radio)."
      },
      {
        "name": "size",
        "type": "'small' | 'medium'",
        "default": "'medium'",
        "description": "Tamano del control (Radio)."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita una opcion individual o el grupo completo (Radio)."
      }
    ]
  },
  "switch": {
    "id": "switch",
    "name": "Switch",
    "import": "@components/ui",
    "builtOn": "SwitchBase (ButtonBase) + track + thumb",
    "description": "Interruptor tipo palanca para alternar un ajuste entre encendido y apagado. Comunica un cambio de estado inmediato y es habitual en paneles de configuracion.",
    "whenToUse": "Usalo para ajustes que se aplican al instante (activar/desactivar); usa Checkbox cuando la eleccion se confirma al enviar un formulario.",
    "props": [
      {
        "name": "checked",
        "type": "boolean",
        "default": "",
        "description": "Estado encendido en modo controlado; usalo junto a onChange."
      },
      {
        "name": "onChange",
        "type": "(e, checked) => void",
        "default": "",
        "description": "Se dispara al alternar; recibe el evento y el nuevo estado booleano."
      },
      {
        "name": "defaultChecked",
        "type": "boolean",
        "default": "false",
        "description": "Estado inicial encendido cuando se usa de forma no controlada."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'default'",
        "default": "'primary'",
        "description": "Color del interruptor cuando esta activo."
      },
      {
        "name": "size",
        "type": "'small' | 'medium'",
        "default": "'medium'",
        "description": "Tamano del interruptor."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el interruptor impidiendo su interaccion."
      },
      {
        "name": "edge",
        "type": "'start' | 'end' | false",
        "default": "false",
        "description": "Compensa el margen del control para alinearlo al inicio o final de un contenedor."
      }
    ]
  },
  "slider": {
    "id": "slider",
    "name": "Slider",
    "import": "@mui/material",
    "builtOn": "<span> raiz + rail + track + thumb + inputs range ocultos",
    "description": "Control deslizante para seleccionar un valor o rango dentro de un intervalo continuo o por pasos. Ideal para ajustes como volumen, precio o cantidades.",
    "whenToUse": "Usalo cuando el valor pertenece a un rango y la posicion relativa importa; usa un TextField numerico cuando se necesita precision exacta.",
    "props": [
      {
        "name": "value",
        "type": "number | number[]",
        "default": "",
        "description": "Valor(es) controlado(s); usa un array para seleccionar un rango."
      },
      {
        "name": "onChange",
        "type": "(e, value) => void",
        "default": "",
        "description": "Se dispara mientras se arrastra; recibe el nuevo valor."
      },
      {
        "name": "min",
        "type": "number",
        "default": "0",
        "description": "Valor minimo del rango."
      },
      {
        "name": "max",
        "type": "number",
        "default": "100",
        "description": "Valor maximo del rango."
      },
      {
        "name": "step",
        "type": "number | null",
        "default": "1",
        "description": "Incremento entre valores; null restringe a los marks definidos."
      },
      {
        "name": "marks",
        "type": "boolean | { value; label? }[]",
        "default": "false",
        "description": "Muestra marcas en el riel, opcionalmente con etiquetas."
      },
      {
        "name": "valueLabelDisplay",
        "type": "'on' | 'auto' | 'off'",
        "default": "'off'",
        "description": "Controla cuando se muestra la etiqueta con el valor actual."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el deslizador."
      },
      {
        "name": "orientation",
        "type": "'horizontal' | 'vertical'",
        "default": "'horizontal'",
        "description": "Orientacion del deslizador."
      }
    ]
  },
  "rating": {
    "id": "rating",
    "name": "Rating",
    "import": "@mui/material",
    "builtOn": "<span> raiz + inputs radio ocultos + SvgIcon (estrellas)",
    "description": "Control de valoracion por estrellas que permite capturar o mostrar una puntuacion. Admite valores fraccionados y modo solo lectura para reflejar calificaciones.",
    "whenToUse": "Usalo para calificaciones subjetivas (resenas, satisfaccion); usa un Slider cuando el valor es una magnitud continua sin connotacion de puntuacion.",
    "props": [
      {
        "name": "value",
        "type": "number | null",
        "default": "",
        "description": "Valoracion controlada; null representa sin valorar."
      },
      {
        "name": "onChange",
        "type": "(e, value) => void",
        "default": "",
        "description": "Se dispara al elegir una puntuacion; recibe el nuevo valor."
      },
      {
        "name": "precision",
        "type": "number",
        "default": "1",
        "description": "Incremento minimo entre valores, por ejemplo 0.5 para medias estrellas."
      },
      {
        "name": "max",
        "type": "number",
        "default": "5",
        "description": "Numero maximo de iconos (estrellas) a mostrar."
      },
      {
        "name": "size",
        "type": "'small' | 'medium' | 'large'",
        "default": "'medium'",
        "description": "Tamano de los iconos de valoracion."
      },
      {
        "name": "readOnly",
        "type": "boolean",
        "default": "false",
        "description": "Muestra la valoracion sin permitir modificarla."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el control atenuandolo."
      },
      {
        "name": "emptyIcon",
        "type": "ReactNode",
        "default": "",
        "description": "Icono usado para las posiciones vacias (no valoradas)."
      }
    ]
  },
  "autocomplete": {
    "id": "autocomplete",
    "name": "Autocomplete",
    "import": "@mui/material",
    "builtOn": "TextField (renderInput) + Popper + Paper + Listbox de opciones",
    "description": "Campo de texto con sugerencias que filtra una lista de opciones a medida que el usuario escribe. Admite seleccion simple o multiple (chips) y creacion de valores libres.",
    "whenToUse": "Usalo para listas largas donde el usuario necesita buscar; usa Select cuando hay pocas opciones fijas sin necesidad de filtrado.",
    "props": [
      {
        "name": "options",
        "type": "T[]",
        "default": "",
        "description": "Arreglo de opciones disponibles para seleccionar o filtrar."
      },
      {
        "name": "renderInput",
        "type": "(params) => ReactNode",
        "default": "",
        "description": "Funcion obligatoria que renderiza el input, normalmente un TextField con los params recibidos."
      },
      {
        "name": "value",
        "type": "T | T[] | null",
        "default": "",
        "description": "Valor(es) seleccionado(s) en modo controlado."
      },
      {
        "name": "onChange",
        "type": "(e, value) => void",
        "default": "",
        "description": "Se dispara al seleccionar o quitar una opcion; recibe el nuevo valor."
      },
      {
        "name": "multiple",
        "type": "boolean",
        "default": "false",
        "description": "Permite seleccionar varias opciones mostradas como chips."
      },
      {
        "name": "getOptionLabel",
        "type": "(option: T) => string",
        "default": "(option) => option.label ?? option",
        "description": "Extrae el texto a mostrar de cada opcion cuando no es un string."
      },
      {
        "name": "freeSolo",
        "type": "boolean",
        "default": "false",
        "description": "Permite introducir valores que no estan en la lista de opciones."
      },
      {
        "name": "loading",
        "type": "boolean",
        "default": "false",
        "description": "Muestra un indicador de carga, util con opciones asincronas."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el control completo."
      }
    ]
  },
  "formcontrol": {
    "id": "formcontrol",
    "name": "FormControl / FormLabel / FormControlLabel / FormGroup",
    "import": "@mui/material",
    "builtOn": "FormControl (Context) + FormLabel + FormControlLabel + FormGroup",
    "description": "Conjunto de contenedores que coordinan estado y estilos de los controles de formulario. FormControl propaga estados como error o disabled, FormLabel titula el grupo, FormControlLabel asocia una etiqueta a un control y FormGroup agrupa varias opciones.",
    "whenToUse": "Usalos para envolver checkboxes, radios o switches con etiqueta y estado compartido; no son necesarios cuando TextField ya incluye su propio FormControl interno.",
    "props": [
      {
        "name": "error",
        "type": "boolean",
        "default": "false",
        "description": "Propaga el estado de error a los controles hijos y al FormLabel (FormControl)."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita todos los controles descendientes (FormControl)."
      },
      {
        "name": "required",
        "type": "boolean",
        "default": "false",
        "description": "Marca el grupo como obligatorio mostrando un asterisco en la etiqueta (FormControl)."
      },
      {
        "name": "fullWidth",
        "type": "boolean",
        "default": "false",
        "description": "Hace que el contenedor ocupe todo el ancho disponible (FormControl)."
      },
      {
        "name": "control",
        "type": "ReactElement",
        "default": "",
        "description": "Elemento de control a etiquetar, por ejemplo un Checkbox, Radio o Switch (FormControlLabel, obligatoria)."
      },
      {
        "name": "label",
        "type": "ReactNode",
        "default": "",
        "description": "Texto o nodo que acompana al control (FormControlLabel)."
      },
      {
        "name": "labelPlacement",
        "type": "'end' | 'start' | 'top' | 'bottom'",
        "default": "'end'",
        "description": "Posicion de la etiqueta respecto al control (FormControlLabel)."
      },
      {
        "name": "row",
        "type": "boolean",
        "default": "false",
        "description": "Distribuye los controles agrupados en horizontal (FormGroup)."
      }
    ]
  },
  "button": {
    "id": "button",
    "name": "Button",
    "import": "@components/ui",
    "builtOn": "MuiButton -> <button>, con la escala de alturas BUTTON_HEIGHT",
    "description": "Boton de accion del producto: envuelve al Button de Material UI con la API de Misky Challay (cinco variantes semanticas, tres tamanos anclados a BUTTON_HEIGHT, estado de carga propio e icono a la izquierda). Con isLoading queda deshabilitado, expone aria-busy y cambia el icono por un spinner, asi que no hay que gestionar el doble clic a mano.",
    "whenToUse": "Es el boton por defecto en toda la aplicacion. El Button de @mui/material solo se usa donde MUI lo exige: dentro de ButtonGroup y como disparador de Menu. Para acciones que se entienden con un icono usa IconButton con aria-label, y Fab para la accion primaria flotante de una pantalla.",
    "props": [
      {
        "name": "variant",
        "type": "'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'",
        "default": "'primary'",
        "description": "Nivel y color de la accion. 'primary' es la accion principal, 'outline' y 'ghost' las secundarias, y 'danger' se reserva a lo destructivo (cancelar un pedido, enviar a la papelera). Traduce internamente a variant + color de MUI."
      },
      {
        "name": "size",
        "type": "'sm' | 'md' | 'lg'",
        "default": "'md'",
        "description": "Altura tomada de BUTTON_HEIGHT, que se exporta desde el mismo modulo: sm 40, md 44 y lg 48 px. 44 es el paso tactil del producto, asi que en Cocina y Reparto (tablet, de pie) no se baja de 'md'."
      },
      {
        "name": "isLoading",
        "type": "boolean",
        "default": "false",
        "description": "Sustituye el icono por un spinner, deshabilita el boton y marca aria-busy. Es la senal de que el clic se registro: usalo en toda accion que llame al servidor."
      },
      {
        "name": "leftIcon",
        "type": "ReactNode",
        "default": "",
        "description": "Icono antes del texto. Ocupa el lugar de startIcon, que esta omitido del tipo a proposito para que solo haya una forma de ponerlo."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el boton. isLoading ya lo aplica por su cuenta, no hace falta combinarlos."
      },
      {
        "name": "onClick",
        "type": "(e) => void",
        "default": "",
        "description": "Manejador del clic. Si dispara una peticion, acompanalo siempre de isLoading."
      },
      {
        "name": "component",
        "type": "ElementType",
        "default": "'button'",
        "description": "Renderiza el boton como otro elemento; con component={Link} y `to` se convierte en un enlace de react-router sin perder el estilo."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra (por ejemplo w-full en un formulario). El radio, la altura y la transicion los pone el componente."
      },
      {
        "name": "sx",
        "type": "SxProps",
        "default": "",
        "description": "Escape a los estilos de MUI. Se fusiona despues de los del componente, asi que puede sobrescribirlos; usalo como ultimo recurso."
      }
    ]
  },
  "iconbutton": {
    "id": "iconbutton",
    "name": "IconButton",
    "import": "@mui/material",
    "builtOn": "ButtonBase -> <button>",
    "description": "Boton circular que contiene unicamente un icono, ideal para acciones compactas en barras de herramientas, tarjetas y listas. Aporta un area de clic comoda y estados hover/focus accesibles.",
    "whenToUse": "Usa IconButton cuando el icono comunica la accion por si solo (recuerda anadir aria-label); usa Button si necesitas texto y Fab para la accion primaria destacada de la pantalla.",
    "props": [
      {
        "name": "color",
        "type": "'default' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'inherit'",
        "default": "'default'",
        "description": "Color del icono tomado de la paleta del tema; 'default' usa el color de texto actual."
      },
      {
        "name": "size",
        "type": "'small' | 'medium' | 'large'",
        "default": "'medium'",
        "description": "Tamano del area del boton y, con ello, del icono que contiene."
      },
      {
        "name": "onClick",
        "type": "(e) => void",
        "default": "",
        "description": "Manejador que se ejecuta al hacer clic en el boton."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el boton e impide la interaccion, mostrando el estado atenuado."
      },
      {
        "name": "edge",
        "type": "'start' | 'end' | false",
        "default": "false",
        "description": "Compensa el margen negativo para alinear el icono al borde inicial o final del contenedor (util en AppBar y ListItem)."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "El icono que se muestra dentro del boton, normalmente un componente de @mui/icons-material."
      }
    ]
  },
  "buttongroup": {
    "id": "buttongroup",
    "name": "ButtonGroup",
    "import": "@mui/material",
    "builtOn": "<div role=\"group\"> que agrupa varios Button",
    "description": "Agrupa varios Button relacionados en un unico bloque visual con bordes compartidos. Util para conjuntos de acciones alternativas o segmentadas que pertenecen al mismo contexto.",
    "whenToUse": "Usa ButtonGroup para agrupar acciones afines y contiguas; usa ToggleButtonGroup cuando necesites seleccion de estado tipo interruptor (uno o varios activos).",
    "props": [
      {
        "name": "variant",
        "type": "'text' | 'outlined' | 'contained'",
        "default": "'outlined'",
        "description": "Estilo de enfasis aplicado por igual a todos los botones del grupo."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'inherit'",
        "default": "'primary'",
        "description": "Color de la paleta aplicado a todos los botones del grupo."
      },
      {
        "name": "size",
        "type": "'small' | 'medium' | 'large'",
        "default": "'medium'",
        "description": "Tamano comun para todos los botones del grupo."
      },
      {
        "name": "orientation",
        "type": "'horizontal' | 'vertical'",
        "default": "'horizontal'",
        "description": "Direccion en la que se apilan los botones del grupo."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita simultaneamente todos los botones del grupo."
      },
      {
        "name": "fullWidth",
        "type": "boolean",
        "default": "false",
        "description": "Hace que el grupo ocupe todo el ancho disponible, repartiendolo entre sus botones."
      },
      {
        "name": "disableElevation",
        "type": "boolean",
        "default": "false",
        "description": "Elimina la sombra del grupo cuando la variante es 'contained'."
      }
    ]
  },
  "fab": {
    "id": "fab",
    "name": "Fab",
    "import": "@mui/material",
    "builtOn": "ButtonBase -> <button>",
    "description": "Boton de accion flotante (Floating Action Button) circular y elevado que representa la accion principal de una pantalla. Suele fijarse sobre el contenido, tipicamente en la esquina inferior derecha.",
    "whenToUse": "Usa Fab para la unica accion mas importante de una vista; usa Button para las acciones normales en formularios y dialogos.",
    "props": [
      {
        "name": "color",
        "type": "'default' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'inherit'",
        "default": "'default'",
        "description": "Color de fondo del boton tomado de la paleta del tema."
      },
      {
        "name": "variant",
        "type": "'circular' | 'extended'",
        "default": "'circular'",
        "description": "Forma del boton: 'circular' solo con icono o 'extended' con icono y texto."
      },
      {
        "name": "size",
        "type": "'small' | 'medium' | 'large'",
        "default": "'large'",
        "description": "Tamano del boton flotante."
      },
      {
        "name": "onClick",
        "type": "(e) => void",
        "default": "",
        "description": "Manejador que se ejecuta al hacer clic en el boton."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el boton e impide la interaccion."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido del boton, normalmente un icono (y texto cuando la variante es 'extended')."
      },
      {
        "name": "href",
        "type": "string",
        "default": "",
        "description": "Si se define, el Fab se renderiza como un enlace <a> hacia esa URL."
      }
    ]
  },
  "menu": {
    "id": "menu",
    "name": "Menu",
    "import": "@mui/material",
    "builtOn": "Popover -> Modal + Paper + MenuList (con MenuItem)",
    "description": "Muestra una lista flotante de opciones (MenuItem) anclada a un elemento disparador, tipica de menus contextuales y desplegables de acciones. El estado de apertura se controla desde el componente padre.",
    "whenToUse": "Usa Menu para elegir una accion u opcion desde un disparador; usa Select para elegir un valor dentro de un formulario y Dialog para flujos que requieren confirmacion explicita.",
    "props": [
      {
        "name": "open",
        "type": "boolean",
        "default": "false",
        "description": "Controla si el menu esta visible. Es obligatorio y debe gestionarse desde el estado del componente padre."
      },
      {
        "name": "anchorEl",
        "type": "HTMLElement | null",
        "default": "null",
        "description": "Elemento del DOM al que se ancla el menu para calcular su posicion (normalmente el boton que lo abre)."
      },
      {
        "name": "onClose",
        "type": "(e, reason) => void",
        "default": "",
        "description": "Se ejecuta cuando el usuario solicita cerrar el menu (clic fuera del area, tecla Escape o Tab). Al seleccionar un MenuItem debes invocar el cierre manualmente, ya que el menu no se cierra solo."
      },
      {
        "name": "keepMounted",
        "type": "boolean",
        "default": "false",
        "description": "Mantiene los MenuItem montados en el DOM aunque el menu este cerrado; util para SEO o para conservar el estado interno del contenido."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Los componentes MenuItem (y opcionalmente Divider) que forman las opciones del menu."
      },
      {
        "name": "onClick (MenuItem)",
        "type": "(e) => void",
        "default": "",
        "description": "Prop de MenuItem: manejador que se ejecuta al seleccionar esa opcion (aqui sueles invocar onClose del Menu)."
      },
      {
        "name": "selected (MenuItem)",
        "type": "boolean",
        "default": "false",
        "description": "Prop de MenuItem: marca la opcion como seleccionada, resaltandola."
      },
      {
        "name": "disabled (MenuItem)",
        "type": "boolean",
        "default": "false",
        "description": "Prop de MenuItem: deshabilita la opcion e impide seleccionarla."
      },
      {
        "name": "divider (MenuItem)",
        "type": "boolean",
        "default": "false",
        "description": "Prop de MenuItem: anade una linea separadora debajo del item para agrupar opciones."
      }
    ]
  },
  "table": {
    "id": "table",
    "name": "Table",
    "import": "@components/ui",
    "builtOn": "TableContainer(Paper outlined) + MuiTable -> <table>, con Thead / Tbody / Tr / Th / Td",
    "description": "Tabla del producto. Ya incluye el contenedor con scroll horizontal, el borde y la cabecera tenue, de modo que no hay que montar TableContainer a mano. `caption` escribe un <caption> visualmente oculto y Th pone scope=\"col\" por defecto: sin esas dos piezas, un lector de pantalla anuncia \"tabla, 7 columnas\" y luego valores sueltos sin decir de que columna son.",
    "whenToUse": "Usala para datos de dos ejes. En movil, la tabla scrollea en horizontal; si la fila tiene mas de cuatro datos importantes, cambia a tarjetas por debajo de sm, como hacen Pedidos y Reclamaciones.",
    "props": [
      {
        "name": "caption",
        "type": "string",
        "default": "",
        "description": "Nombre accesible de la tabla. Se pinta como <caption> en sr-only porque la pantalla ya trae su titulo visible encima."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Composicion con Thead, Tbody, Tr, Th y Td. Th y Td aceptan las props de TableCell de MUI (align, colSpan, padding)."
      },
      {
        "name": "scope",
        "type": "'col' | 'row'",
        "default": "'col'",
        "description": "Prop de Th. 'row' en las tablas cuya primera celda es la etiqueta de la fila."
      },
      {
        "name": "size",
        "type": "'small' | 'medium'",
        "default": "'medium'",
        "description": "Se reenvia a MuiTable. 'small' compacta el relleno de las celdas en tablas largas."
      },
      {
        "name": "stickyHeader",
        "type": "boolean",
        "default": "false",
        "description": "Se reenvia a MuiTable: fija la cabecera al hacer scroll vertical dentro del contenedor."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra sobre <table> (por ejemplo min-w para forzar el scroll horizontal antes de que las columnas se aplasten)."
      }
    ]
  },
  "chip": {
    "id": "chip",
    "name": "Chip",
    "import": "@components/ui",
    "builtOn": "<span> con rounded-pill; el aspa de quitar es un <button> propio",
    "description": "Ficha compacta seleccionable o removible: filtros aplicados, etiquetas de entrada y valores de un multiselector. Con `active` se pinta en color de marca y con `onRemove` aparece el aspa, que detiene la propagacion para no disparar tambien el onClick del chip.",
    "whenToUse": "Usa Chip para algo que el usuario puede quitar o alternar. Si solo comunica un estado y no se toca, usa Badge; para una tira de filtros excluyentes, FilterPills.",
    "props": [
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido del chip. Admite un icono suelto delante del texto."
      },
      {
        "name": "active",
        "type": "boolean",
        "default": "false",
        "description": "Marca el chip como seleccionado (fondo de marca y texto blanco). Util en tiras de filtros."
      },
      {
        "name": "onClick",
        "type": "() => void",
        "default": "",
        "description": "Al definirse, el chip se vuelve pulsable (cursor, hover y elevacion). Si el chip es un control real, envuelvelo o dale foco: el <span> no lo recibe solo."
      },
      {
        "name": "onRemove",
        "type": "() => void",
        "default": "",
        "description": "Al definirse aparece el aspa a la derecha, con aria-label \"Quitar\", que no propaga el clic al chip."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra. El radio de pildora y el ritmo interno los pone el componente."
      }
    ]
  },
  "avatar": {
    "id": "avatar",
    "name": "Avatar",
    "import": "@mui/material",
    "builtOn": "<div> contenedor con <img> interno (o fallback a iniciales/icono)",
    "description": "Muestra la imagen de perfil de un usuario o entidad; si la imagen falla o no existe, hace fallback a iniciales o a un icono. Se usa en listas, cabeceras y tarjetas para identificar personas.",
    "whenToUse": "Usa Avatar para representar usuarios o entidades con imagen o iniciales; para agrupar varios usa AvatarGroup y para contadores o notificaciones usa Badge.",
    "props": [
      {
        "name": "src",
        "type": "string",
        "default": "",
        "description": "URL de la imagen a mostrar en el avatar."
      },
      {
        "name": "alt",
        "type": "string",
        "default": "",
        "description": "Texto alternativo de la imagen; se usa junto a src/srcSet y aporta accesibilidad."
      },
      {
        "name": "variant",
        "type": "'circular' | 'rounded' | 'square'",
        "default": "'circular'",
        "description": "Forma del avatar."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido de respaldo (iniciales o icono) que se muestra cuando no hay una imagen valida en src."
      },
      {
        "name": "srcSet",
        "type": "string",
        "default": "",
        "description": "Atributo srcSet para servir imagenes responsivas segun densidad o ancho de pantalla."
      },
      {
        "name": "sizes",
        "type": "string",
        "default": "",
        "description": "Atributo sizes de la imagen para seleccionar la fuente segun el viewport."
      },
      {
        "name": "slotProps",
        "type": "{ img?: object, fallback?: object }",
        "default": "{}",
        "description": "Props reenviadas a los slots internos: 'img' para el elemento de imagen y 'fallback' para el icono o iniciales de respaldo."
      }
    ]
  },
  "avatargroup": {
    "id": "avatargroup",
    "name": "AvatarGroup",
    "import": "@mui/material",
    "builtOn": "<div> flex que agrupa varios Avatar superpuestos",
    "description": "Agrupa multiples Avatar solapados y colapsa el excedente en un avatar con contador (+N). Ideal para mostrar participantes, colaboradores o asignados de forma compacta.",
    "whenToUse": "Usa AvatarGroup cuando necesitas mostrar varios usuarios juntos con un limite visible; para un solo usuario usa Avatar directamente.",
    "props": [
      {
        "name": "max",
        "type": "number",
        "default": "5",
        "description": "Numero maximo de avatares visibles antes de colapsar el resto en un avatar +N."
      },
      {
        "name": "total",
        "type": "number",
        "default": "children.length",
        "description": "Total real de avatares cuando no todos se renderizan como hijos; ajusta el contador del excedente (por defecto, el numero de hijos)."
      },
      {
        "name": "spacing",
        "type": "'small' | 'medium' | number",
        "default": "'medium'",
        "description": "Cantidad de solapamiento entre avatares; acepta un valor numerico en px."
      },
      {
        "name": "variant",
        "type": "'circular' | 'rounded' | 'square'",
        "default": "'circular'",
        "description": "Forma aplicada a los avatares del grupo."
      },
      {
        "name": "renderSurplus",
        "type": "(surplus: number) => ReactNode",
        "default": "",
        "description": "Funcion para personalizar el contenido del avatar de excedente (+N)."
      },
      {
        "name": "slotProps",
        "type": "{ surplus?: object }",
        "default": "{}",
        "description": "Props reenviadas al slot interno 'surplus', el avatar de excedente que muestra el contador +N."
      },
      {
        "name": "component",
        "type": "React.ElementType",
        "default": "'div'",
        "description": "Sobrescribe el elemento raiz del grupo."
      }
    ]
  },
  "badge": {
    "id": "badge",
    "name": "Badge",
    "import": "@components/ui",
    "builtOn": "<span> con rounded-pill; acepta cualquier atributo de span",
    "description": "Etiqueta compacta para estados, conteos y categorias. Nueve variantes con fondo y tinta ya emparejados. La variante 'accent' usa accent-700 y no accent-500: ese amarillo da 2,42:1 sobre blanco, la mitad del minimo AA para 12 px, y aqui se pintan avisos que hay que poder leer.",
    "whenToUse": "Usa Badge para un estado que se lee y no se toca. Si el usuario puede quitarlo o alternarlo, usa Chip; si necesitas el estado de un pedido, un ticket o un reparto, usa los badges de estado del panel, que ya traen el mapa de etiquetas en espanol.",
    "props": [
      {
        "name": "variant",
        "type": "'brand' | 'accent' | 'neutral' | 'success' | 'strong' | 'solid' | 'warning' | 'danger' | 'outline'",
        "default": "'brand'",
        "description": "Pareja de fondo y tinta. 'solid' y 'strong' para destacar dentro de una lista, 'danger' y 'warning' para lo que exige atencion, 'outline' cuando el fondo ya esta coloreado."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Texto de la etiqueta. Admite un icono de 12 px delante; el gap ya esta puesto."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra. No sobrescribas el radio: sale del token rounded-pill que gestiona el editor de tema."
      },
      {
        "name": "title",
        "type": "string",
        "default": "",
        "description": "Como cualquier atributo de <span>, se reenvia tal cual al elemento (title, id, data-*, onClick...)."
      }
    ]
  },
  "alert": {
    "id": "alert",
    "name": "Alert",
    "import": "@components/ui",
    "builtOn": "Paper (renderizado como <div role=\"alert\">) que agrupa el icono de severidad, el mensaje y el area de accion o cierre",
    "description": "Muestra un mensaje breve y destacado que informa al usuario sobre el estado o resultado de una accion (exito, error, aviso o informacion) sin interrumpir su flujo. Puede acompanarse de un componente AlertTitle, colocado como hijo, para anadir un encabezado al mensaje.",
    "whenToUse": "Usalo para mensajes en linea persistentes dentro del layout; usa Snackbar para notificaciones temporales flotantes y Dialog para bloquear la interaccion hasta que el usuario responda.",
    "props": [
      {
        "name": "severity",
        "type": "'error' | 'warning' | 'info' | 'success'",
        "default": "'success'",
        "description": "Define el tono semantico del mensaje y determina el color y el icono por defecto."
      },
      {
        "name": "variant",
        "type": "'standard' | 'filled' | 'outlined'",
        "default": "'standard'",
        "description": "Estilo visual del contenedor: fondo suave (standard), fondo solido (filled) o solo borde (outlined)."
      },
      {
        "name": "color",
        "type": "'error' | 'warning' | 'info' | 'success'",
        "default": "",
        "description": "Sobrescribe el color derivado de severity sin alterar el icono asociado; admite tambien colores personalizados del tema."
      },
      {
        "name": "onClose",
        "type": "(event) => void",
        "default": "",
        "description": "Callback que solicita el cierre. Cuando se define y no se pasa la prop action, se muestra un boton de cierre que lo ejecuta al pulsarlo."
      },
      {
        "name": "action",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido de accion mostrado al final del alert, como un boton para deshacer o reintentar."
      },
      {
        "name": "icon",
        "type": "ReactNode | false",
        "default": "",
        "description": "Reemplaza el icono por defecto de la severidad; con false se oculta el icono."
      },
      {
        "name": "closeText",
        "type": "string",
        "default": "'Close'",
        "description": "Etiqueta accesible (aria-label y title) del boton de cierre que aparece al usar onClose."
      }
    ]
  },
  "snackbar": {
    "id": "snackbar",
    "name": "Toast",
    "import": "@components/mui/MuiToast",
    "builtOn": "ClickAwayListener -> div fijo (position: fixed) -> Grow (transicion) -> SnackbarContent (o el children personalizado)",
    "description": "Muestra una notificacion breve y no intrusiva en un extremo de la pantalla, normalmente para confirmar que una accion se completo. Puede ocultarse automaticamente tras un tiempo o incluir una accion como deshacer.",
    "whenToUse": "Usalo para avisos temporales de baja prioridad que no requieren accion obligatoria; usa Alert para mensajes persistentes en linea y Dialog cuando se necesita una decision del usuario.",
    "props": [
      {
        "name": "open",
        "type": "boolean",
        "default": "",
        "description": "Si es true, el snackbar se muestra; se controla desde el estado del componente padre."
      },
      {
        "name": "message",
        "type": "ReactNode",
        "default": "",
        "description": "Texto o contenido del mensaje que se muestra cuando no se pasa un children personalizado."
      },
      {
        "name": "autoHideDuration",
        "type": "number | null",
        "default": "null",
        "description": "Milisegundos tras los cuales se llama a onClose automaticamente; con null permanece abierto de forma indefinida."
      },
      {
        "name": "onClose",
        "type": "(event, reason) => void",
        "default": "",
        "description": "Se ejecuta cuando el componente solicita cerrarse; reason puede ser 'timeout', 'clickaway' o 'escapeKeyDown'."
      },
      {
        "name": "anchorOrigin",
        "type": "{ vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }",
        "default": "{ vertical: 'bottom', horizontal: 'left' }",
        "description": "Posicion de la pantalla donde aparece el snackbar."
      },
      {
        "name": "action",
        "type": "ReactNode",
        "default": "",
        "description": "Elemento de accion, como un boton para deshacer o cerrar el aviso."
      },
      {
        "name": "resumeHideDuration",
        "type": "number",
        "default": "",
        "description": "Milisegundos de espera antes de ocultar el snackbar tras una interaccion del usuario; si no se indica, se usa autoHideDuration / 2."
      },
      {
        "name": "disableWindowBlurListener",
        "type": "boolean",
        "default": "false",
        "description": "Si es true, el temporizador de autoHideDuration sigue corriendo aunque la ventana pierda el foco."
      },
      {
        "name": "key",
        "type": "any",
        "default": "",
        "description": "Al mostrar mensajes consecutivos con un unico Snackbar, asignar una key distinta a cada mensaje asegura su tratamiento independiente y reinicia el temporizador."
      }
    ]
  },
  "linearprogress": {
    "id": "linearprogress",
    "name": "LinearProgress",
    "import": "@mui/material",
    "builtOn": "<span role=\"progressbar\"> con barras internas animadas (bar1 y bar2)",
    "description": "Indicador de progreso en forma de barra horizontal que comunica que una operacion esta en curso, con avance conocido o indefinido. Util para cargas de pagina, subidas de archivos o procesos por lotes.",
    "whenToUse": "Usalo para progreso a lo ancho del contenedor o de la pagina; usa CircularProgress para espacios reducidos o indicadores centrados y Skeleton para simular el contenido mientras carga.",
    "props": [
      {
        "name": "variant",
        "type": "'determinate' | 'indeterminate' | 'buffer' | 'query'",
        "default": "'indeterminate'",
        "description": "Tipo de progreso: con valor conocido (determinate), indefinido (indeterminate), con buffer o de consulta (query)."
      },
      {
        "name": "value",
        "type": "number",
        "default": "",
        "description": "Valor de avance (entre min y max) cuando la variante es determinate o buffer."
      },
      {
        "name": "valueBuffer",
        "type": "number",
        "default": "",
        "description": "Valor del buffer (entre min y max) usado con la variante buffer."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'inherit' | string",
        "default": "'primary'",
        "description": "Color de la barra tomado de la paleta del tema; admite 'primary', 'secondary', 'inherit' o un color personalizado."
      },
      {
        "name": "min",
        "type": "number",
        "default": "0",
        "description": "Valor minimo del indicador para las variantes determinate y buffer."
      },
      {
        "name": "max",
        "type": "number",
        "default": "100",
        "description": "Valor maximo del indicador para las variantes determinate y buffer."
      }
    ]
  },
  "circularprogress": {
    "id": "circularprogress",
    "name": "CircularProgress",
    "import": "@mui/material",
    "builtOn": "<span role=\"progressbar\"> con <svg><circle> animado",
    "description": "Indicador de progreso circular giratorio que senala que una operacion esta en marcha, con avance definido o indeterminado. Ideal para botones, tarjetas o zonas compactas de la interfaz.",
    "whenToUse": "Usalo en espacios reducidos o como spinner centrado; usa LinearProgress cuando quieras mostrar avance a lo ancho y Skeleton para representar el contenido que va a cargar.",
    "props": [
      {
        "name": "variant",
        "type": "'determinate' | 'indeterminate'",
        "default": "'indeterminate'",
        "description": "Muestra un valor concreto de avance (determinate) o una animacion continua sin fin conocido (indeterminate)."
      },
      {
        "name": "value",
        "type": "number",
        "default": "0",
        "description": "Valor de avance (entre min y max, por defecto de 0 a 100) cuando la variante es determinate."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'inherit'",
        "default": "'primary'",
        "description": "Color del indicador tomado de la paleta del tema; admite tambien colores personalizados."
      },
      {
        "name": "size",
        "type": "number | string",
        "default": "40",
        "description": "Diametro del circulo en pixeles (numero) o en una unidad CSS (string)."
      },
      {
        "name": "thickness",
        "type": "number",
        "default": "3.6",
        "description": "Grosor del trazo del circulo."
      },
      {
        "name": "disableShrink",
        "type": "boolean",
        "default": "false",
        "description": "Desactiva la animacion de encogimiento del trazo; solo tiene efecto en la variante indeterminate."
      }
    ]
  },
  "skeleton": {
    "id": "skeleton",
    "name": "Skeleton",
    "import": "@mui/material",
    "builtOn": "<span> con animacion de pulso u onda",
    "description": "Marcador de posicion que reproduce la forma del contenido antes de que este disponible, reduciendo la sensacion de espera y evitando saltos de layout. Se usa para textos, imagenes y bloques mientras se cargan los datos.",
    "whenToUse": "Usalo para simular el contenido real durante la carga inicial; usa CircularProgress o LinearProgress cuando solo necesitas indicar actividad sin anticipar la estructura.",
    "props": [
      {
        "name": "variant",
        "type": "'text' | 'circular' | 'rectangular' | 'rounded'",
        "default": "'text'",
        "description": "Forma del placeholder segun el tipo de contenido que representa (texto, circulo, rectangulo o rectangulo redondeado)."
      },
      {
        "name": "width",
        "type": "number | string",
        "default": "",
        "description": "Ancho del skeleton en pixeles o en una unidad CSS."
      },
      {
        "name": "height",
        "type": "number | string",
        "default": "",
        "description": "Alto del skeleton en pixeles o en una unidad CSS."
      },
      {
        "name": "animation",
        "type": "'pulse' | 'wave' | false",
        "default": "'pulse'",
        "description": "Tipo de animacion de carga (pulse u wave); con false se muestra estatico."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido a partir del cual el skeleton infiere automaticamente su ancho y alto."
      }
    ]
  },
  "breadcrumbs": {
    "id": "breadcrumbs",
    "name": "Breadcrumbs",
    "import": "@mui/material",
    "builtOn": "Typography renderizada como <nav>, con lista <ol>/<li> y separadores entre items",
    "description": "Muestra la ruta jerarquica de navegacion donde se encuentra el usuario dentro de la aplicacion. Permite volver rapidamente a niveles superiores mediante enlaces separados por un caracter o icono.",
    "whenToUse": "Usalo para indicar la ubicacion en jerarquias profundas de paginas; usa Tabs para alternar vistas del mismo nivel y Stepper para procesos secuenciales.",
    "props": [
      {
        "name": "separator",
        "type": "ReactNode",
        "default": "'/'",
        "description": "Elemento que se dibuja entre cada nivel de la ruta (texto o icono, por ejemplo un chevron)."
      },
      {
        "name": "maxItems",
        "type": "number",
        "default": "8",
        "description": "Numero maximo de niveles visibles antes de colapsar la ruta en un boton de puntos suspensivos."
      },
      {
        "name": "itemsBeforeCollapse",
        "type": "number",
        "default": "1",
        "description": "Cantidad de elementos que se mantienen visibles al inicio cuando la ruta se colapsa."
      },
      {
        "name": "itemsAfterCollapse",
        "type": "number",
        "default": "1",
        "description": "Cantidad de elementos que se mantienen visibles al final cuando la ruta se colapsa."
      },
      {
        "name": "expandText",
        "type": "string",
        "default": "'Show path'",
        "description": "Texto accesible (aria-label) del boton que expande la ruta completa cuando esta colapsada."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Los niveles de la ruta, normalmente componentes Link y un Typography final para la pagina actual."
      },
      {
        "name": "component",
        "type": "ElementType",
        "default": "'nav'",
        "description": "Elemento raiz que se renderiza; util para cambiar la semantica del contenedor."
      }
    ]
  },
  "tabs": {
    "id": "tabs",
    "name": "Tabs",
    "import": "@mui/material",
    "builtOn": "<div> con [role=tablist] (Flexbox) + Tab sobre ButtonBase",
    "description": "Organiza contenido relacionado en secciones que ocupan el mismo espacio y se alternan mediante pestanas. Cada Tab representa una vista y solo una permanece activa a la vez.",
    "whenToUse": "Usalo para alternar entre vistas del mismo nivel jerarquico; usa Breadcrumbs para navegacion jerarquica y Stepper para flujos secuenciales.",
    "props": [
      {
        "name": "value",
        "type": "any",
        "default": "",
        "description": "Valor de la pestana actualmente seleccionada; debe coincidir con la prop value de un Tab."
      },
      {
        "name": "onChange",
        "type": "(e, value) => void",
        "default": "",
        "description": "Callback que se dispara al seleccionar otra pestana; recibe el nuevo value para actualizar el estado."
      },
      {
        "name": "variant",
        "type": "'standard' | 'scrollable' | 'fullWidth'",
        "default": "'standard'",
        "description": "Modo de distribucion de las pestanas: fijas, con desplazamiento o repartidas a lo ancho."
      },
      {
        "name": "orientation",
        "type": "'horizontal' | 'vertical'",
        "default": "'horizontal'",
        "description": "Direccion en la que se alinean las pestanas y su indicador."
      },
      {
        "name": "centered",
        "type": "boolean",
        "default": "false",
        "description": "Centra las pestanas dentro del contenedor (no compatible con variant scrollable)."
      },
      {
        "name": "textColor",
        "type": "'primary' | 'secondary' | 'inherit'",
        "default": "'primary'",
        "description": "Color del texto de las pestanas."
      },
      {
        "name": "indicatorColor",
        "type": "'primary' | 'secondary'",
        "default": "'primary'",
        "description": "Color de la barra indicadora que marca la pestana activa."
      },
      {
        "name": "scrollButtons",
        "type": "'auto' | true | false",
        "default": "'auto'",
        "description": "Controla los botones de desplazamiento cuando las pestanas exceden el ancho disponible."
      },
      {
        "name": "label",
        "type": "ReactNode",
        "default": "",
        "description": "Prop del componente Tab: texto o contenido que se muestra en cada pestana."
      }
    ]
  },
  "pagination": {
    "id": "pagination",
    "name": "Pagination",
    "import": "@components/ui",
    "builtOn": "<nav aria-label=\"Paginacion\"> con botones de 36 px",
    "description": "Paginador de ventana: anterior, hasta cinco numeros alrededor de la pagina actual y siguiente. La pagina activa lleva aria-current=\"page\" y los extremos se deshabilitan solos. Si solo hay una pagina no se renderiza nada, asi que se puede montar sin condicion previa.",
    "whenToUse": "Usalo siempre que el servidor devuelva `meta` con total y totalPages: una lista cortada en silencio es peor que una lista larga. Para flujos de scroll continuo (menu de la tienda) usa carga incremental en su lugar.",
    "props": [
      {
        "name": "page",
        "type": "number",
        "default": "",
        "description": "Pagina actual, empezando en 1. Es un componente controlado."
      },
      {
        "name": "totalPages",
        "type": "number",
        "default": "",
        "description": "Numero total de paginas, normalmente Math.ceil(meta.total / pageSize). Con 1 o menos el componente devuelve null."
      },
      {
        "name": "onChange",
        "type": "(page: number) => void",
        "default": "",
        "description": "Recibe la pagina destino. Recuerda volver a 1 cuando cambie un filtro o la busqueda."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra sobre el <nav> (alineacion, margenes)."
      }
    ]
  },
  "stepper": {
    "id": "stepper",
    "name": "Stepper",
    "import": "@mui/material",
    "builtOn": "<div> (Flexbox) + Step/StepLabel con StepIcon y StepConnector",
    "description": "Representa el avance de un proceso dividido en pasos secuenciales, indicando cual esta activo, completado o pendiente. Guia al usuario a traves de flujos de varias etapas como formularios o asistentes.",
    "whenToUse": "Usalo para procesos lineales de varios pasos con un orden claro; usa Tabs si las secciones son independientes y no requieren completarse en orden.",
    "props": [
      {
        "name": "activeStep",
        "type": "number",
        "default": "0",
        "description": "Indice (base cero) del paso actualmente activo; los anteriores se marcan como completados."
      },
      {
        "name": "orientation",
        "type": "'horizontal' | 'vertical'",
        "default": "'horizontal'",
        "description": "Direccion en la que se disponen los pasos."
      },
      {
        "name": "alternativeLabel",
        "type": "boolean",
        "default": "false",
        "description": "Coloca la etiqueta del paso debajo del icono en lugar de a su lado (solo horizontal)."
      },
      {
        "name": "nonLinear",
        "type": "boolean",
        "default": "false",
        "description": "Permite que el usuario acceda a los pasos en cualquier orden en vez de forma secuencial."
      },
      {
        "name": "connector",
        "type": "ReactElement",
        "default": "<StepConnector />",
        "description": "Elemento que dibuja la linea de conexion entre pasos; puede personalizarse o anularse."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Los componentes Step que contienen cada StepLabel del proceso."
      },
      {
        "name": "completed",
        "type": "boolean",
        "default": "",
        "description": "Prop del componente Step: marca ese paso como completado independientemente del activeStep."
      },
      {
        "name": "optional",
        "type": "ReactNode",
        "default": "",
        "description": "Prop de StepLabel: contenido secundario para indicar que el paso es opcional."
      },
      {
        "name": "error",
        "type": "boolean",
        "default": "false",
        "description": "Prop de StepLabel: muestra el paso en estado de error."
      }
    ]
  },
  "dialog": {
    "id": "dialog",
    "name": "Modal",
    "import": "@components/ui",
    "builtOn": "Modal + Paper (con Backdrop y transicion Fade por defecto); se acompana de DialogTitle, DialogContent y DialogActions",
    "description": "Ventana modal centrada que interrumpe el flujo para mostrar informacion critica o pedir una decision al usuario. Bloquea el resto de la interfaz hasta que se confirme o se cierre.",
    "whenToUse": "Usalo para confirmaciones, formularios cortos o alertas que requieren atencion inmediata; para paneles laterales usa Drawer y para mensajes breves no bloqueantes usa Snackbar.",
    "props": [
      {
        "name": "open",
        "type": "boolean",
        "default": "false",
        "description": "Controla si el dialogo esta visible. Es un componente controlado: tu estado decide cuando se muestra."
      },
      {
        "name": "onClose",
        "type": "(event, reason: 'backdropClick' | 'escapeKeyDown') => void",
        "default": "",
        "description": "Se dispara al cerrar por clic en el fondo o con la tecla Escape; aqui actualizas tu estado para poner open en false."
      },
      {
        "name": "fullWidth",
        "type": "boolean",
        "default": "false",
        "description": "Hace que el dialogo ocupe todo el ancho disponible hasta el limite marcado por maxWidth."
      },
      {
        "name": "maxWidth",
        "type": "'xs' | 'sm' | 'md' | 'lg' | 'xl' | false",
        "default": "'sm'",
        "description": "Limita el ancho maximo del dialogo. Con false no se aplica ningun tope de ancho."
      },
      {
        "name": "fullScreen",
        "type": "boolean",
        "default": "false",
        "description": "Expande el dialogo a pantalla completa, util en moviles o en formularios largos."
      },
      {
        "name": "scroll",
        "type": "'paper' | 'body'",
        "default": "'paper'",
        "description": "Define donde ocurre el scroll cuando el contenido es largo: dentro del propio dialogo ('paper') o en el body de la pagina ('body')."
      },
      {
        "name": "disableEscapeKeyDown",
        "type": "boolean",
        "default": "false",
        "description": "Impide cerrar el dialogo con la tecla Escape, util para pasos obligatorios."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido del dialogo, normalmente DialogTitle, DialogContent y DialogActions."
      }
    ]
  },
  "drawer": {
    "id": "drawer",
    "name": "Drawer",
    "import": "@components/ui",
    "builtOn": "Paper con transicion Slide; la variante temporary anade Modal + Backdrop, mientras que persistent y permanent no usan Modal",
    "description": "Panel deslizante anclado a un borde de la pantalla para navegacion, filtros o menus secundarios. Puede aparecer sobre el contenido o quedar fijo de forma permanente.",
    "whenToUse": "Usalo para navegacion lateral o paneles de filtros persistentes; para decisiones puntuales que interrumpen el flujo usa Dialog.",
    "props": [
      {
        "name": "open",
        "type": "boolean",
        "default": "false",
        "description": "Controla si el drawer esta abierto. Relevante sobre todo en las variantes temporary y persistent."
      },
      {
        "name": "onClose",
        "type": "(event, reason: 'backdropClick' | 'escapeKeyDown') => void",
        "default": "",
        "description": "Se dispara al cerrar por clic en el fondo o con Escape en la variante temporary; aqui pones open en false."
      },
      {
        "name": "anchor",
        "type": "'left' | 'top' | 'right' | 'bottom'",
        "default": "'left'",
        "description": "Borde de la pantalla desde el que aparece y al que se ancla el panel."
      },
      {
        "name": "variant",
        "type": "'temporary' | 'persistent' | 'permanent'",
        "default": "'temporary'",
        "description": "Comportamiento del drawer: temporary flota sobre el contenido con backdrop, persistent empuja el contenido y permanent queda siempre visible."
      },
      {
        "name": "elevation",
        "type": "number",
        "default": "16",
        "description": "Profundidad de la sombra del panel; solo se aplica en la variante temporary (las demas usan borde sin sombra)."
      },
      {
        "name": "transitionDuration",
        "type": "number | { enter?: number; exit?: number }",
        "default": "{ enter: 225, exit: 195 }",
        "description": "Duracion en milisegundos de la animacion de entrada y salida del panel."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido del panel, tipicamente una List con items de navegacion."
      }
    ]
  },
  "tooltip": {
    "id": "tooltip",
    "name": "Tooltip",
    "import": "@components/ui",
    "builtOn": "<span class=\"group relative\"> + globo con role=\"tooltip\", solo CSS",
    "description": "Globo de ayuda que aparece al pasar el cursor y tambien al enfocar con el teclado (group-focus-within), sin JavaScript ni portal.",
    "whenToUse": "Para nombrar un control que solo muestra icono. No sustituye al aria-label: el globo es visual, el nombre accesible va en el boton. Como se posiciona en el flujo, dentro de una tarjeta con overflow-hidden o de otro elemento con la clase `group` usa el Tooltip de @mui/material, que se portala fuera.",
    "props": [
      {
        "name": "content",
        "type": "ReactNode",
        "default": "",
        "description": "Texto del globo. Se pinta en una sola linea (whitespace-nowrap): si no cabe en una frase corta, no es un tooltip."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Elemento que dispara la ayuda. Debe ser enfocable para que el globo aparezca tambien con teclado."
      },
      {
        "name": "side",
        "type": "'top' | 'bottom' | 'left' | 'right'",
        "default": "'top'",
        "description": "Lado por el que sale el globo respecto al disparador."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra sobre el envoltorio, que es un inline-flex."
      }
    ]
  },
  "card": {
    "id": "card",
    "name": "Card",
    "import": "@components/ui",
    "builtOn": "Paper variant=\"outlined\" -> <div>, con rounded-card y la escala de elevacion e1..e5",
    "description": "Superficie base del producto: borde, radio del token y relleno ya resueltos. La sombra sale de la escala e1..e5 y no de un valor a ojo, para que dos pantallas hermanas no se vean a distinta profundidad. Al aplicarse como clase (y no por sx) se puede sustituir desde fuera, que es lo que necesitan las tarjetas con estado activo o hover propio.",
    "whenToUse": "Agrupa contenido relacionado dentro de una pantalla. Para un bloque de formulario con titulo y descripcion usa FormSection, y para un aviso puntual, Alert o Callout. CardHeader, CardTitle y CardDescription montan el encabezado con el ritmo correcto.",
    "props": [
      {
        "name": "shadow",
        "type": "'none' | 'e1' | 'e2' | 'e3' | 'e4' | 'e5'",
        "default": "'e2'",
        "description": "Paso de la escala de elevacion. Si le anades un hover, subelo desde el paso en reposo (e2 -> e3): mezclar la escala con una sombra suelta deja las dos clases en el elemento y gana la que el CSS escriba ultima."
      },
      {
        "name": "className",
        "type": "string",
        "default": "",
        "description": "Clases extra. Sustituyen a las del componente cuando chocan (tailwind-merge), por ejemplo para cambiar el relleno."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido de la tarjeta."
      },
      {
        "name": "onClick",
        "type": "(e) => void",
        "default": "",
        "description": "Como cualquier atributo de <div>, se reenvia tal cual. Si la tarjeta entera es pulsable, pon dentro un enlace o boton real en vez de depender de este manejador."
      }
    ]
  },
  "accordion": {
    "id": "accordion",
    "name": "Accordion",
    "import": "@mui/material",
    "builtOn": "Paper -> <div>",
    "description": "Panel plegable que muestra u oculta contenido bajo una cabecera clickable. AccordionSummary define la cabecera y AccordionDetails el contenido expandible.",
    "whenToUse": "Usa Accordion para condensar secciones largas de contenido que el usuario abre bajo demanda; usa Tabs para alternar entre vistas del mismo nivel.",
    "props": [
      {
        "name": "expanded",
        "type": "boolean",
        "default": "",
        "description": "Controla si el panel esta abierto (modo controlado). Se usa junto con onChange."
      },
      {
        "name": "onChange",
        "type": "(event, expanded) => void",
        "default": "",
        "description": "Callback que se dispara al expandir o contraer; recibe el evento y el nuevo estado expandido."
      },
      {
        "name": "defaultExpanded",
        "type": "boolean",
        "default": "false",
        "description": "Estado inicial abierto/cerrado en modo no controlado."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": "false",
        "description": "Deshabilita el panel para que no pueda expandirse ni contraerse."
      },
      {
        "name": "disableGutters",
        "type": "boolean",
        "default": "false",
        "description": "Elimina el margen extra entre paneles y el aumento de alto al expandir, para un aspecto mas compacto."
      },
      {
        "name": "square",
        "type": "boolean",
        "default": "false",
        "description": "Si es true elimina el redondeado de las esquinas del panel."
      },
      {
        "name": "elevation",
        "type": "number",
        "default": "1",
        "description": "Nivel de sombra (0-24) heredado de Paper para dar profundidad al panel."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido del panel, tipicamente AccordionSummary y AccordionDetails."
      },
      {
        "name": "sx",
        "type": "SxProps<Theme>",
        "default": "",
        "description": "Estilos rapidos con acceso al tema (colores, margenes, ancho, etc.)."
      }
    ]
  },
  "divider": {
    "id": "divider",
    "name": "Divider",
    "import": "@mui/material",
    "builtOn": "<hr> (o <div> cuando lleva children)",
    "description": "Linea fina que separa visualmente contenido o grupos dentro de listas, toolbars o layouts. Puede incluir texto o un elemento en el centro.",
    "whenToUse": "Usa Divider para marcar una separacion visible entre elementos relacionados; usa solo espaciado (margin/padding) cuando no necesitas una linea.",
    "props": [
      {
        "name": "orientation",
        "type": "'horizontal' | 'vertical'",
        "default": "'horizontal'",
        "description": "Direccion de la linea. La vertical suele requerir flexItem dentro de un contenedor flex."
      },
      {
        "name": "variant",
        "type": "'fullWidth' | 'inset' | 'middle'",
        "default": "'fullWidth'",
        "description": "Controla el sangrado de la linea: completa, con sangria izquierda (inset) o con margen a ambos lados (middle)."
      },
      {
        "name": "flexItem",
        "type": "boolean",
        "default": "false",
        "description": "Permite que la linea se estire correctamente dentro de un contenedor flex, necesario para divisores verticales."
      },
      {
        "name": "textAlign",
        "type": "'center' | 'left' | 'right'",
        "default": "'center'",
        "description": "Alineacion del texto o elemento pasado como children a lo largo de la linea."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido opcional (texto, chip, icono) que se muestra centrado sobre la linea."
      },
      {
        "name": "component",
        "type": "ElementType",
        "default": "'hr'",
        "description": "Elemento raiz a renderizar; cambia automaticamente a 'div' cuando se pasan children."
      },
      {
        "name": "sx",
        "type": "SxProps<Theme>",
        "default": "",
        "description": "Estilos rapidos con acceso al tema (color, grosor, margenes, etc.)."
      }
    ]
  },
  "paper": {
    "id": "paper",
    "name": "Paper",
    "import": "@mui/material",
    "builtOn": "<div>",
    "description": "Superficie base de Material Design con elevacion o borde sobre la que se apoyan otros componentes. Es el bloque de construccion de Card, Accordion, Menu y otros.",
    "whenToUse": "Usa Paper para una superficie generica con fondo y elevacion; usa Card cuando necesitas estructura de contenido y acciones, o Box si no necesitas superficie.",
    "props": [
      {
        "name": "elevation",
        "type": "number",
        "default": "1",
        "description": "Nivel de sombra (0-24) que determina la profundidad aparente cuando variant es 'elevation'."
      },
      {
        "name": "variant",
        "type": "'elevation' | 'outlined'",
        "default": "'elevation'",
        "description": "Define si la superficie usa sombra (elevation) o un borde plano sin sombra (outlined)."
      },
      {
        "name": "square",
        "type": "boolean",
        "default": "false",
        "description": "Si es true elimina el redondeado de las esquinas."
      },
      {
        "name": "component",
        "type": "ElementType",
        "default": "'div'",
        "description": "Elemento o componente raiz que se renderiza, para ajustar la semantica del contenedor."
      },
      {
        "name": "children",
        "type": "ReactNode",
        "default": "",
        "description": "Contenido que se muestra sobre la superficie."
      },
      {
        "name": "sx",
        "type": "SxProps<Theme>",
        "default": "",
        "description": "Estilos rapidos con acceso al tema (padding, ancho, colores, etc.)."
      }
    ]
  },
  "typography": {
    "id": "typography",
    "name": "Typography",
    "import": "@mui/material",
    "builtOn": "Typography root -> elemento HTML segun variant (h1-h6, p, span, etc.) via variantMapping",
    "description": "Aplica la escala tipografica del tema (tamano, peso, interlineado y color) a cualquier texto de la interfaz. Se usa para titulos, parrafos, subtitulos, leyendas y cualquier bloque de texto que deba respetar la jerarquia visual del design system.",
    "whenToUse": "Usalo para todo texto visible en la UI; si solo necesitas dar estilo puntual sin semantica tipografica, un Box con sx puede bastar.",
    "props": [
      {
        "name": "variant",
        "type": "'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'subtitle1' | 'subtitle2' | 'body1' | 'body2' | 'caption' | 'button' | 'overline' | 'inherit'",
        "default": "'body1'",
        "description": "Define el estilo tipografico (tamano, peso e interlineado) y, mediante variantMapping, el elemento HTML por defecto que se renderiza."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'text.primary' | 'text.secondary' | string",
        "default": "",
        "description": "Color del texto usando tokens del tema (por ejemplo 'text.primary', 'text.secondary' o 'primary.main') o cualquier color CSS valido."
      },
      {
        "name": "component",
        "type": "React.ElementType",
        "default": "",
        "description": "Sobrescribe el elemento raiz (por ejemplo renderizar un 'h2' con estilo de 'h1') para mantener correcta la semantica HTML."
      },
      {
        "name": "gutterBottom",
        "type": "boolean",
        "default": "false",
        "description": "Anade un margen inferior para separar el texto del contenido siguiente."
      },
      {
        "name": "align",
        "type": "'inherit' | 'left' | 'center' | 'right' | 'justify'",
        "default": "'inherit'",
        "description": "Alineacion horizontal del texto dentro de su contenedor."
      },
      {
        "name": "noWrap",
        "type": "boolean",
        "default": "false",
        "description": "Evita el salto de linea y recorta el texto que desborda con puntos suspensivos (ellipsis); requiere un elemento con ancho definido."
      },
      {
        "name": "sx",
        "type": "SxProps<Theme>",
        "default": "",
        "description": "Estilos puntuales (peso, color, margenes, etc.) usando el sistema de estilos y los tokens del tema."
      },
      {
        "name": "variantMapping",
        "type": "Partial<Record<variant, string>>",
        "default": "",
        "description": "Personaliza que elemento HTML se renderiza para cada variant (por ejemplo mapear 'subtitle1' a un 'h6') sin cambiar su estilo visual."
      }
    ]
  },
  "link": {
    "id": "link",
    "name": "Link",
    "import": "@mui/material",
    "builtOn": "Typography -> <a>",
    "description": "Renderiza un enlace navegable con los estilos del tema (color y subrayado consistentes). Sirve para enlaces de navegacion, acciones inline dentro de texto o integracion con routers como React Router.",
    "whenToUse": "Usalo para navegar a otra ruta o URL; si la accion ejecuta logica sin cambiar de pagina, prefiere Button con variant='text'.",
    "props": [
      {
        "name": "href",
        "type": "string",
        "default": "",
        "description": "URL o ruta de destino del enlace."
      },
      {
        "name": "underline",
        "type": "'none' | 'hover' | 'always'",
        "default": "'always'",
        "description": "Controla cuando se muestra el subrayado del enlace."
      },
      {
        "name": "color",
        "type": "'primary' | 'secondary' | 'error' | 'inherit' | 'text.primary' | 'text.secondary' | string",
        "default": "'primary'",
        "description": "Color del enlace usando tokens del tema, como 'primary', 'inherit' o 'text.secondary'."
      },
      {
        "name": "component",
        "type": "React.ElementType",
        "default": "",
        "description": "Sobrescribe el elemento raiz, por ejemplo el Link de React Router (RouterLink) para navegacion SPA."
      },
      {
        "name": "target",
        "type": "string",
        "default": "",
        "description": "Destino de apertura del enlace, por ejemplo '_blank' para abrir en una nueva pestana (combinar con rel='noopener noreferrer')."
      },
      {
        "name": "rel",
        "type": "string",
        "default": "",
        "description": "Relacion del enlace con el recurso destino; usa 'noopener noreferrer' junto a target='_blank' por seguridad."
      },
      {
        "name": "onClick",
        "type": "(event: React.MouseEvent) => void",
        "default": "",
        "description": "Manejador que se ejecuta al hacer clic en el enlace."
      },
      {
        "name": "variant",
        "type": "'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'subtitle1' | 'subtitle2' | 'body1' | 'body2' | 'caption' | 'button' | 'overline' | 'inherit'",
        "default": "'inherit'",
        "description": "Aplica un estilo tipografico al enlace; por defecto hereda el del texto contenedor."
      }
    ]
  }
};

/** Devuelve la ficha de un componente por id (o undefined si no existe). */
export const getDoc = (id: string): ComponentDocMeta | undefined => COMPONENT_DOCS[id];
