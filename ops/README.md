# Coleta ANM validada para a madrugada

A coleta roda às **00:00 America/Sao_Paulo**, com até três tentativas (intervalo de cinco minutos após falha, dentro da janela de uma hora). O Contabo inicia `UpdateANMPipeline` às **00:30**, exige recibo do dia corrente e encadeia licenças/UC → TI. Não há garantia de atualização caso a ANM falhe: nesse caso a aplicação preserva os dados anteriores e o job termina com erro.

`collect_anm.py` usa curl HTTPS, limita o download a 1 GiB e executa CRC de todos os membros, valida caminhos, limites, SHP/DBF e presença de SHX/PRJ. Trabalha com memória limitada; não inicia outro processo Node. O serviço tem `MemoryMax=64M`. O ZIP só se torna público após validação, por troca atômica de symlink. Cada geração possui ZIP e recibo JSON imutáveis. Mantém pelo menos três gerações; gerações adicionais com mais de um dia são removidas na coleta seguinte. Arquivos temporários de uma execução interrompida exigem inspeção operacional.

O proxy resolve o symlink uma vez e serve o mesmo arquivo e seus cabeçalhos `X-ANM-SHA256`, `X-ANM-Downloaded-At`, `X-ANM-Validated-At`, `X-ANM-Bytes`, com `Cache-Control: no-store`. Não requer nova rota nem exceção no Cloudflare. A prova atesta o momento da coleta/validação; não afirma que a ANM alterou o conteúdo.

## Instalação

No Azure, em `/opt/services/amazonia-minada-anm-proxy`:

1. Preserve Compose, código, imagem e ZIP anteriores em diretório protegido.
2. Execute primeiro a coleta em storage separado e rode os testes abaixo.
3. Copie `ops/minada-anm-collect.{service,timer}` para `/etc/systemd/system/` e execute `systemd-analyze verify`.
4. Execute uma coleta válida para o storage real antes de habilitar `ANM_EXTERNAL_COLLECTOR=true` no proxy.
5. Recrie somente `app` com a nova imagem. Para usar a imagem já instalada, monte `src/server.ts` e `src/validated-download.ts` como em `docker-compose.nightly.yml`. A configuração efetiva de produção deve persistir esses mounts e a variável, inclusive em recriações futuras.
6. `systemctl daemon-reload`; `systemctl enable --now minada-anm-collect.timer`. Não habilite a unidade `.service` no boot: o timer persistente cuida de disparos perdidos.
7. Confirme o próximo disparo com `systemctl list-timers minada-anm-collect.timer` e o recibo por GET/HEAD do ZIP a partir do Contabo.
8. Implante a verificação do recibo e o job encadeado no repositório `amazonia-minada`. O horário fixo sozinho não é uma dependência: o bloqueio por data, hash, CRC e ordenação das etapas é obrigatório.

## Verificação e reversão

`python3 -m unittest discover -s test -p 'test_*.py'`

`node --test test/*.test.mjs` (Node 24 para testes TypeScript nativos; dependências instaladas).

`journalctl -u minada-anm-collect.service` registra sucesso ou erro e o recibo, sem segredos. `systemctl status minada-anm-collect.timer` verifica o agendamento.

Para reverter ambos os lados: pause o timer, confira que não há coleta/importação ativa e restaure primeiro a imagem/configuração anterior do Contabo (ela não exige recibo). Depois restaure código/Compose e o ZIP anterior no Azure e recrie somente o proxy. Preserve a geração nova e os logs para investigação. Não sobrescreva um alvo de symlink com `cp`: restaure para arquivo temporário e renomeie. Credenciais, regras de rede e dados do MongoDB não precisam mudar para reverter o código/agendamento. Um dump e os arquivos anteriores devem permanecer disponíveis se houver necessidade de reverter dados.

Se o ZIP estiver antigo às 00:30, o job falha antes de alterar a coleção ativa. Uma coleta tardia não dispara importação automaticamente; execute o job completo autenticado após verificar o recibo. No Contabo, uma queda abrupta pode deixar `files/.anm-pipeline.lock`; só remova após confirmar que nenhum worker está ativo.
