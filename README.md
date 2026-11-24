# Watt Ahead Bill Planner

Crie um aplicativo web responsivo, funcional e visualmente refinado chamado "Voltara", em português do Brasil, para PREVER CONTA DE LUZ SEM ANOTAÇÕES DIÁRIAS. O usuário NÃO quer ficar alterando planilhas ou registrando o uso de aparelhos toda hora. Ele define hábitos uma vez e recebe previsões automaticamente.

OBJETIVO PRINCIPAL: apresentar previsão do valor da fatura de energia do mês atual e dos próximos 12 meses, baseada no perfil dos aparelhos, frequência de uso, quantidade real de dias de cada mês, tarifa editável e valor de fatura de referência. Não é medidor inteligente: nunca afirme que monitora consumo em tempo real ou que acessa dados da concessionária sem integração autorizada. Deixe claras estimativas e incertezas.

DADOS PRÉ-CONFIGURADOS (EDITÁVEIS EM CONFIGURAÇÕES, não exigir cadastro diário):
• Última fatura mensal informada: R$ 220,00, valor de referência de novembro/2026 (permitir corrigir mês).
• Tarifa TOTAL estimada R$ 1,35/kWh (preço configurável e explicitamente estimado; impostos/bandeiras podem variar, e evitar cobrar tributos duas vezes).
• PC AMD Ryzen 5 3400G sem GPU dedicada, 24 GB RAM, com monitor; ~16 kWh/mês de referência; uso 18h-23h em dias úteis, ocasionalmente 30 min de manhã e domingos a partir de 17h; majoritariamente séries 19h-23h, às vezes LoL 19h-21h.
• Ventilador de teto: 75 W, ~8 horas por noite, todos os dias.
• Geladeira: 40 kWh/mês, ligada continuamente (usar estimativa mensal da etiqueta, não calcular potência vezes 24h; compressor funciona em ciclos).
• Scooter ELÉTRICA: carregamento todas as noites; estimativa inicial de energia da TOMADA de 1,2 kWh/recarga (não multiplicar watts do carregador pelo tempo total; consumo varia durante a carga).
• Criar categoria "Outros aparelhos e encargos" como resíduo de calibração entre a soma do modelo e a conta de R$220, identificado corretamente como parcela desconhecida, NÃO como energia medida. Se houver fatura real em kWh futuramente, oferecer calibração melhor e separar valores fixos/taxas do consumo variável.
• Sábado: não inventar rotina exata, usar parâmetro ajustável em "hábitos" e cenários conservadores. 

FUNCIONALIDADES:
1. Dashboard bonito, mobile-first: custo previsto do mês atual em destaque, variação vs R$ 220, gráfico de distribuição por aparelho, consumo mensal previsto em kWh, faixa provável (mínimo/central/máximo), dias do mês, e texto que explica a estimativa sem fingir precisão.
2. Gráfico de previsão para 12 meses seguintes, eixo com meses em pt-BR, adequado ao celular; incluir quantidade real de dias de cada mês, inclusive fevereiro/ano bissexto.
3. Página "Aparelhos": cards para PC, ventilador, geladeira, scooter, outros; switches para habilitar/desabilitar e edição simples de dias por semana, horas, potência ou kWh/uso/kWh por mês, conforme o tipo correto. Adicionar e excluir aparelhos personalizados (presets: TV, roteador, chuveiro, air fryer, micro-ondas, máquina de lavar e iluminação).
4. Página "Hábitos": configuração UMA VEZ das rotinas de uso: horários, frequência e limites. Mudanças ocasionais de hora de dormir não exigem lançar nada; usar médias.
5. Página "Contas": histórico OPCIONAL de contas mensais (valor em reais, kWh quando disponível, competência). A entrada de UMA nova conta quando quiser refina a previsão e calcula erro entre previsto e real. Deve poder ficar meses sem inserir nada, mantendo previsão válida mas com indicação de menor confiança. Não solicitar fotos, CPF nem endereço.
6. Simulador de cenários: custo ao reduzir ventilador em 1h, scooter a cada 2 dias, troca por geladeira mais eficiente, aumento da tarifa, adição de aparelho. Mudanças em simulação não alteram o perfil salvo sem confirmação.
7. Configurações: tarifa média ajustável em reais/kWh, encargos fixos opcionais, preferências de gráfico, seleção de localidade ("RJ" como inicial) sem geolocalização obrigatória, data de faturamento se conhecida e ajuste da referência.
8. Persistência local no navegador usando localStorage (sem login, sem Supabase, sem backend, sem IA ou API externa obrigatória). Botão exportar/importar backup JSON e CSV de histórico/projeção. Interface pronta para usar offline se tecnicamente viável (PWA opcional). Alertar que limpar dados do navegador remove informações se não houver backup.
9. Acessibilidade, temas preto/grafite com acentos violeta e branco, visual moderno e sóbrio, microinterações suaves sem poluição visual, boa legibilidade em Android e PC, sidebar compacta desktop e navegação inferior no mobile, ícones consistentes. Formatação monetária pt-BR, datas corretas e unidades visíveis.
10. Matemática transparente e confiável: fórmulas documentadas no código para kWh = (W/1000)*h*dias ou kWh por recarga * nº de cargas; evitar somar consumo de geladeira duas vezes e evitar contagem dupla do residual calibrado. Permitir comparar faixa de cenários. A projeção precisa ter valores plausíveis e reativos a mudanças. Incluir testes automatizados básicos de calculadora, persistência e calibração, sem quebrar a UI.
11. Primeiro acesso deve abrir dashboard JÁ preenchido com os valores acima, sem onboarding obrigatório nem detalhes pessoais. Inserir aviso conciso: "Estimativa baseada em hábitos, não medição em tempo real."
12. Não publicar o projeto em produção automaticamente. Criar e deixar uma prévia para eu avaliar, sem deploy público.

Prioridade máxima: FLUXO SIMPLES, PROJEÇÃO AUTOMÁTICA e CÁLCULO HONESTO. Evite formulário grande e qualquer necessidade de registro diário. Implemente código funcional, não apenas mockup.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://watt-ahead-bill-planner.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/da09f771-7183-488c-b2d5-3ca493f7c866).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
