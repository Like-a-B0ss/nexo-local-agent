# Nexo

Um agente de IA local com interface completa, memória persistente e ferramentas reais. O Nexo usa o Ollama e o `qwen3:0.6b`, mantendo conversas e dados na própria máquina.

## O que já faz

- Conversas persistentes, histórico e exclusão de sessões
- Agente com ciclo de ferramentas (até 6 etapas por solicitação)
- Calculadora segura, data/hora, informações da máquina, memória e tarefas
- Progresso visível das ações via stream NDJSON
- Interface responsiva para desktop e celular
- Execução 100% local, sem chave de API

## Requisitos

- Node.js 22+
- [Ollama](https://ollama.com/download)
- Aproximadamente 4 GB livres para o modelo

## Rodar

```powershell
npm install
ollama pull qwen3:0.6b
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). A API roda em `http://localhost:3333`.

Para gerar e executar a versão de produção:

```powershell
npm run build
npm start
```

## Configuração

Copie `.env.example` para `.env` se quiser alterar `OLLAMA_URL`, `OLLAMA_MODEL` ou `PORT`. As conversas, memórias e tarefas são salvas atomicamente em `data/nexo.json` e não entram no Git.

## Arquitetura

O frontend React consome uma API Express. A API mantém o ciclo do agente, envia ao modelo as ferramentas disponíveis, executa localmente somente a função solicitada e devolve eventos incrementais à interface. Nenhum comando de shell ou acesso arbitrário a arquivos é exposto ao modelo.
