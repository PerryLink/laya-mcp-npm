# laya-mcp

Servidor MCP para as decisões tipadas do [Laya](https://github.com/NandhaKishorM/laya) — `noul` (sim/não), `choice`, `score` — embrulhado para sobreviver ao contacto com um servidor.

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```bash
npx -y laya-mcp --help
```

Registado como [`io.github.PerryLink/laya-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=perrylink) no registo MCP oficial.

> **Este pacote npm é um lançador, não uma implementação.** O Laya é um modelo PyTorch, por isso o servidor em si é Python. Instalar este pacote dá-te o ponto de entrada de Node e nada mais; também precisas do lado Python:
>
> ```bash
> pip install "laya-mcp[mcp]"
> ```
>
> O `npx laya-mcp` encontra esse interpretador, entrega-lhe o stdio e deixa passar o fluxo MCP sem lhe tocar. Não instala nada por ti — trazer torch (~2 GB) e um checkpoint (~650 MB) como efeito secundário de correr um comando não é algo que um lançador deva fazer.

### Se não encontrar o teu Python

No Windows, o `python` no PATH é muitas vezes o alias de execução da Microsoft Store, que é um stub: não consegue importar nada e fica *à frente* do teu interpretador real. Por isso o lançador relata o que tentou em vez de afirmar que falta o pacote. De qualquer forma, nomeia o interpretador diretamente:

```bash
# nomeia-o diretamente
set LAYA_MCP_PYTHON=C:\path\to\python.exe        # Windows
export LAYA_MCP_PYTHON=/path/to/python           # macOS, Linux

# ou simplesmente ativa o virtualenv onde o instalaste — VIRTUAL_ENV é respeitado
```

> O `LAYACORE_PYTHON` continua a ser lido. As versões 0.1.0 e 0.1.1 imprimiam esse nome na mensagem de erro, e um lançador que deixasse de honrar a variável que a sua própria versão anterior te disse para definir seria pior do que um que carrega o alias.

> **Estado: 0.1.4, em desenvolvimento.** O núcleo em Python está implementado e coberto por CI. O lançador está coberto por dez verificações sobre a descoberta de interpretadores, que é onde já se enganou antes. As interfaces podem mudar antes de 1.0.

---

## Porque existe

O Laya trunca coisas em silêncio e não reporta nada disso:

- **Corta o estado pelo fim.** Um documento longo perde a cauda — para um contrato ou uma thread de email, muitas vezes onde estava a resposta — e o modelo responde sobre o prefixo sobrevivente com total confiança.
- **Encurta as opções até as etiquetas serem indistinguíveis.** As opções partilham um orçamento fixo de tokens por pergunta; a partir de certo ponto cada etiqueta recebe ~4 tokens. É a causa documentada do seu colapso em escolhas de alta cardinalidade.
- **O seu `confidence` não é exatidão.** É uma entropia normalizada: baixa quando a probabilidade está espalhada mesmo quando a opção principal está certa, e alta numa resposta errada mas confiante.
- **Degrada-se para CPU perante um OOM de CUDA**, permanentemente, sem nenhuma flag definida — cerca de 10-15x mais lento, e nada na resposta o diz.

Este pacote acrescenta um preflight que reporta o que seria cortado, erros estruturados que nomeiam a pergunta culpada, um contrato de confiança honesto e uma superfície de saúde que admite uma degradação.

## Utilização

```bash
laya-mcp serve      # sidecar HTTP quente em 127.0.0.1:8787 (carrega o modelo uma vez)
laya-mcp mcp        # MCP sobre stdio
laya-mcp doctor     # o que está instalado, e se a GPU funciona mesmo
laya-mcp install    # regista no harness de agente que tiveres
```

O `install` trata do facto de não haver forma portátil de registar um servidor MCP: Claude Code (`mcpServers`), Codex (`[mcp_servers.<name>]`), opencode (`mcp`, com `command` como array), OpenClaw (`mcp.servers`) e Hermes (`mcp_servers`) recebem cada um a forma correta no ficheiro correto, fundida e com cópia de segurança em vez de sobrescrita. O `pi` não tem suporte MCP nativo e é reportado como não suportado.

Prefere `serve` mais `--sidecar` a alojar o modelo em cada processo stdio: um harness lança um servidor por sessão, e carregar um checkpoint de 650 MB por sessão é a principal razão de um servidor MCP suportado por Python parecer lento.

## Limites honestos

Os números do próprio upstream, repetidos porque uma integração que insinue o contrário está a mentir-te: os checkpoints base estão **perto do acaso em zero-shot** em decisões tipadas (0.362 contra uma linha de base de classe maioritária de 0.461); o `score` é a primitiva mais fraca (35% contra 70% em medição independente); o erro de calibração cru é 0.466 antes de ajustar a temperatura; e uma execução de fixture respondeu «A» em 46 de 50 itens de escolha múltipla.

A calibração torna uma probabilidade honesta; não consegue tornar um modelo correto.

## Licença

Apache-2.0. O Laya é Apache-2.0, da Convai Innovations. Esta é uma integração independente, não afiliada nem endossada por esse projeto.
