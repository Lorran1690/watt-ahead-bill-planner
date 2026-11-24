# Voltara · Previsor da conta de luz

Aplicativo web responsivo para estimar a fatura de energia em **R$ e kWh** a partir dos hábitos da casa, sem diário de consumo. O modelo de referência utiliza uma fatura inicial de R$ 220 e pode ser recalibrado com outras contas quando o usuário desejar.

## O que funciona

- **Painel:** previsão do mês corrente, faixa estimada, distribuição por aparelho e próximos 12 meses.
- **Aparelhos:** gerenciar potência e horas, consumo mensal de etiqueta ou kWh por uso/recarga. Inclui aparelhos predefinidos e personalizados.
- **Hábitos:** médias de dias úteis, sábados e domingos, além da frequência semanal de usos.
- **Contas:** cadastro opcional de faturas, valor em R$, kWh quando disponível, edição, histórico, comparação e exportação CSV.
- **Simulador:** modificar ventilador, geladeira, scooter, tarifa e aparelhos hipotéticos sem alterar o perfil salvo.
- **Configurações:** tarifa, referência, encargos, gráfico, incerteza, backup JSON, importação JSON e exportação CSV.

## Importante: são estimativas, não leituras reais

O Voltara **não acessa a concessionária, não monitora a tomada e não usa IA**. A tarifa (inicialmente R$ 1,35/kWh) e os consumos são hipóteses ajustáveis. A bateria da scooter usa kWh **por recarga**, não a potência do carregador multiplicada pelo número de horas conectado. Para geladeiras, o ideal é a etiqueta de consumo em kWh/mês.

Consumo estimado:

- Potência e horas: `kWh = W / 1000 × horas de uso`.
- Equipamentos por utilização: `kWh = kWh por uso × usos estimados no mês`.
- Equipamentos com etiqueta: `kWh = kWh por 30 dias × dias do mês / 30`.
- Custo: `R$ = kWh estimados × tarifa total + encargos fixos`.

Os dias do mês são reais, inclusive fevereiro bissexto, e horas do PC podem variar por dia da semana. A diferença entre a fatura de referência e os aparelhos cadastrados é uma **parcela desconhecida**, não consumo medido. Para comparar uma economia hipotética, o simulador mantém essa parcela fixa.

## Privacidade e recuperação de dados

O estado fica no **localStorage** do navegador. Não é necessário cadastrar conta ou senha. O JSON exportado em Configurações permite backup e restauração em outro navegador. Apagar dados do site pode remover o histórico se não existir backup. A aplicação não promete uso offline completo.

## Desenvolvimento

Este projeto usa TanStack Start, React, TypeScript, Tailwind CSS e Recharts. Requer Bun ou Node.js compatível.

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run build
```

Workflow `.github/workflows/quality.yml`: executa testes e build em pushes para `main` e pull requests, **sem fazer deploy**.

## GitHub ↔ Lovable

Este repositório está sincronizado com o projeto no [Lovable](https://lovable.dev/projects/da09f771-7183-488c-b2d5-3ca493f7c866). Não reescreva o histórico publicado com force push ou rebase. As mudanças no código sincronizam com o editor do Lovable, mas o estado de publicação e créditos é controlado pela plataforma.

## Limitações e verificações adicionais

- Dados de tarifa, bandeiras, impostos e aparelhos não são obtidos automaticamente. Atualize-os quando mudarem.
- A previsão não substitui medição por wattímetro nem uma fatura da distribuidora.
- A verificação automatizada cobre cálculos, normalização de backups, rotas e build; testes manuais de ponta a ponta em navegadores Android e desktop ainda são recomendados.
- Um PWA offline completo, conexão com medidores ou leitura automática de faturas não foram implementados.
