# laya-mcp

Servidor MCP para las decisiones tipadas de [Laya](https://github.com/NandhaKishorM/laya) — `noul` (sí/no), `choice`, `score` — envuelto para sobrevivir al contacto con un servidor.

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```bash
npx -y laya-mcp --help
```

Registrado como [`io.github.PerryLink/laya-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=perrylink) en el registro MCP oficial.

> **Este paquete npm es un lanzador, no una implementación.** Laya es un modelo PyTorch, así que el servidor en sí es Python. Instalar este paquete te da el punto de entrada de Node y nada más; también necesitas el lado de Python:
>
> ```bash
> pip install "laya-mcp[mcp]"
> ```
>
> `npx laya-mcp` encuentra ese intérprete, le cede stdio y deja pasar el flujo MCP sin tocarlo. No instala nada por ti — traer torch (~2 GB) y un checkpoint (~650 MB) como efecto secundario de ejecutar un comando no es algo que deba hacer un lanzador.

### Si no encuentra tu Python

En Windows, el `python` del PATH suele ser el alias de ejecución de Microsoft Store, que es un stub: no puede importar nada y se sitúa *delante* de tu intérprete real. Por eso el lanzador informa de lo que probó en vez de afirmar que falta el paquete. En cualquier caso, nombra el intérprete directamente:

```bash
# nómbralo directamente
set LAYA_MCP_PYTHON=C:\path\to\python.exe        # Windows
export LAYA_MCP_PYTHON=/path/to/python           # macOS, Linux

# o simplemente activa el virtualenv en el que lo instalaste — VIRTUAL_ENV se respeta
```

> `LAYACORE_PYTHON` se sigue leyendo. Las versiones 0.1.0 y 0.1.1 imprimían ese nombre en el mensaje de error, y un lanzador que dejara de honrar la variable que su propia versión anterior te dijo que definieras sería peor que uno que conserva el alias.

> **Estado: 0.1.5, en desarrollo.** El núcleo en Python está implementado y cubierto por CI. El lanzador está cubierto por diez comprobaciones sobre el descubrimiento de intérpretes, que es donde se ha equivocado antes. Las interfaces pueden cambiar antes de 1.0.

---

## Por qué existe

Laya trunca cosas en silencio y no reporta nada de ello:

- **Corta el estado por el final.** Un documento largo pierde su cola — para un contrato o un hilo de correo, a menudo donde estaba la respuesta — y el modelo responde sobre el prefijo superviviente con total confianza.
- **Acorta las opciones hasta que las etiquetas son indistinguibles.** Las opciones comparten un presupuesto fijo de tokens por pregunta; pasado cierto punto cada etiqueta recibe ~4 tokens. Es la causa documentada de su colapso en elecciones de alta cardinalidad.
- **Su `confidence` no es la exactitud.** Es una entropía normalizada: baja cuando la probabilidad está repartida aunque la opción principal sea la correcta, y alta en una respuesta incorrecta pero segura.
- **Se degrada a CPU ante un OOM de CUDA**, permanentemente, sin ninguna bandera activada — unas 10-15 veces más lento, y nada en la respuesta lo dice.

Este paquete añade un preflight que informa de lo que se cortaría, errores estructurados que nombran la pregunta culpable, un contrato de confianza honesto y una superficie de salud que admite una degradación.

## Uso

```bash
laya-mcp serve      # sidecar HTTP caliente en 127.0.0.1:8787 (carga el modelo una vez)
laya-mcp mcp        # MCP sobre stdio
laya-mcp doctor     # qué está instalado, y si la GPU funciona de verdad
laya-mcp install    # regístralo en el harness de agente que tengas
```

`install` se ocupa de que no hay forma portable de registrar un servidor MCP: Claude Code (`mcpServers`), Codex (`[mcp_servers.<name>]`), opencode (`mcp`, con `command` como array), OpenClaw (`mcp.servers`) y Hermes (`mcp_servers`) reciben cada uno la forma correcta en el archivo correcto, fusionada y con copia de seguridad en vez de sobrescrita. `pi` no tiene soporte MCP nativo y se reporta como no soportado.

Prefiere `serve` más `--sidecar` antes que alojar el modelo en cada proceso stdio: un harness lanza un servidor por sesión, y cargar un checkpoint de 650 MB por sesión es la razón principal de que un servidor MCP respaldado por Python se sienta lento.

## Límites honestos

Los números del propio upstream, repetidos porque una integración que insinúe lo contrario te está mintiendo: los checkpoints base están **cerca del azar en zero-shot** sobre decisiones tipadas (0.362 frente a una línea base de clase mayoritaria de 0.461); `score` es la primitiva más débil (35% frente a 70% en medición independiente); el error de calibración crudo es 0.466 antes de ajustar la temperatura; y una ejecución de fixture respondió «A» en 46 de 50 ítems de opción múltiple.

La calibración hace honesta una probabilidad; no puede hacer correcto a un modelo.

## Licencia

Apache-2.0. Laya es Apache-2.0, de Convai Innovations. Esta es una integración independiente, no afiliada ni respaldada por ese proyecto.
