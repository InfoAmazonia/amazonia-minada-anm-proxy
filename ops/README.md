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
5. Recrie somente `app` com a nova imagem. A imagem nova executa `dist/server.js` compilado e já contém a validação de recibos. Remova mounts antigos de `src/*.ts`; mantenha a variável `ANM_EXTERNAL_COLLECTOR=true` e o storage. O usuário `node` precisa de leitura nas gerações e recibos (diretórios 0755, arquivos 0644), sem acesso às credenciais do host.
6. `systemctl daemon-reload`; `systemctl enable --now minada-anm-collect.timer`. Não habilite a unidade `.service` no boot: o timer persistente cuida de disparos perdidos.
7. Confirme o próximo disparo com `systemctl list-timers minada-anm-collect.timer` e o recibo por GET/HEAD do ZIP a partir do Contabo.
8. Implante a verificação do recibo e o job encadeado no repositório `amazonia-minada`. O horário fixo sozinho não é uma dependência: o bloqueio por data, hash, CRC e ordenação das etapas é obrigatório.

## Verificação e reversão

`python3 -m unittest discover -s test -p 'test_*.py'`

`npm ci && npm test` (Node 24.22.1 ou superior da linha 24; compila e testa a rota real em JavaScript).

`journalctl -u minada-anm-collect.service` registra sucesso ou erro e o recibo, sem segredos. `systemctl status minada-anm-collect.timer` verifica o agendamento.

Para reverter ambos os lados: pause o timer, confira que não há coleta/importação ativa e restaure primeiro a imagem/configuração anterior do Contabo (ela não exige recibo). Depois restaure código/Compose e o ZIP anterior no Azure e recrie somente o proxy. Preserve a geração nova e os logs para investigação. Não sobrescreva um alvo de symlink com `cp`: restaure para arquivo temporário e renomeie. Credenciais, regras de rede e dados do MongoDB não precisam mudar para reverter o código/agendamento. Um dump e os arquivos anteriores devem permanecer disponíveis se houver necessidade de reverter dados.

Se o ZIP estiver antigo às 00:30, o job falha antes de alterar a coleção ativa. Uma coleta tardia não dispara importação automaticamente; execute o job completo autenticado após verificar o recibo. No Contabo, uma queda abrupta pode deixar `files/.anm-pipeline.lock`; só remova após confirmar que nenhum worker está ativo.

## Atualização do runtime e do Traefik (23/10/2026)

O Dockerfile fixa Node 24.22.1 LTS por digest, usa Alpine e compila/testa em uma etapa separada. A imagem final executa JavaScript como usuário `node`, contém apenas as dependências de produção e remove npm/Yarn/Corepack. Express permanece na linha 4 atualizada, evitando mudança de API de roteamento; as demais dependências e o lockfile foram atualizados. `npm audit` deve passar tanto com quanto sem `--omit=dev`. O download de produção continua a cargo do coletor Python/curl do host; ele não usa o Axios do modo legado.

Construa em outro servidor com RAM suficiente, por exemplo `docker build -t minada-proxy:20261023-node24-r2 .`; o build executa `npm test`. Rode também os testes Python. Antes da publicação, teste o container final com storage de teste, `ANM_EXTERNAL_COLLECTOR=true`, e o Traefik candidato em rede Docker isolada: GET, HEAD, Range, recibo ausente (503), arquivo não permitido (404) e redirecionamento inicial. Não publique portas de teste nem use certificados reais em fixtures. Escaneie a imagem final e o Traefik, além do lockfile; alertas do sistema base exigem avaliação separada.

No Azure, mantenha cópias privadas de todo o código/configuração do proxy, `.env`, configuração e certificados do Traefik, ZIP/recibos e imagens anteriores. Restaure a configuração em diretório separado e compare arquivos; recalcule o SHA-256 do ZIP restaurado. Guarde as imagens com tags `minada-proxy:rollback-20261023` e `minada-traefik:rollback-20261023`, além de um `docker save` comprimido.

Transfira a imagem pronta via `docker save`/`docker load`. No Compose do proxy, fixe `image: minada-proxy:20261023-node24-r2` e remova os mounts antigos de fontes TypeScript. Preserve `.env`, storage, portas, rede e labels. Recrie apenas `app` com `--no-build --pull never` e confira o ZIP público antes de alterar o Traefik. Atualize a imagem do projeto separado `/opt/services/proxy` com a referência de `ops/traefik-image.yml`, preservando sua configuração, certificados e rede. Depois de cada troca, teste a rota HTTPS a partir do Contabo.

A reversão é `sudo sh ops/rollback-images.sh /var/backups/minada/proxy-images-20261023T2040Z`. O script restaura fontes/Compose e imagens anteriores; mantém os certificados, as gerações validadas e o agendamento. Antes de usá-lo, preserve o estado atual para investigação. Depois confira novamente o ZIP e seus cabeçalhos, site, APIs e CSV. Não execute builds nem npm na VM pequena do Azure.

A rota também trata desconexões durante o download sem tentar escrever novos cabeçalhos nem encerrar o processo. O teste HTTP interrompe um download de 16 MiB e exige que o processo continue atendendo HEAD.
