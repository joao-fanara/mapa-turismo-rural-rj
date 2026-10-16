# Glossário e revisão das traduções (EN · FR · DE)

Estado: as 629 descrições e os catálogos estão em **tradução automática** (status `automática`). Este documento orienta a revisão humana. Fonte das boas práticas: relatório de revisão do projeto irmão (`mapa-3d/docs/telao-revisao-traducoes-2026-10-16.md`).

## Regras
1. **Preservar** nome oficial do lugar, município, região, endereço, telefone, URL e redes. Traduzir só a descrição e o funcionamento.
2. **Não prometer o que o guia não diz** (categoria, estrutura, "aberto", "confirmado"). Ausência de informação não vira confirmação.
3. **Localização aproximada** mantém a limitação: bairro/endereço/município, nunca "no local".
4. Termos culturais sem equivalente: manter o original e explicar uma vez, curto.
5. Número, data e hora pelo idioma (já feito na interface); moeda e unidade como no guia.
6. Fallback explícito: texto sem tradução aparece em português; no admin, só vira `revisada` quando uma pessoa aprovar.

## Termos a decidir (preencher com a Setur/TurisRio)
| Termo | Pergunta | Proposta atual |
|---|---|---|
| Fazenda | nome próprio, produção, hospedagem ou visita histórica? | manter no nome; "farm"/"ferme"/"Fazenda" na descrição |
| Sítio | propriedade, categoria ou referência? | "farm"/"ferme rurale"/"Hof" conforme o caso |
| Pousada, hospedagem rural | que serviço o cadastro comprova? | "guesthouse"/"gîte"/"Pension", sem classificar |
| Alambique, engenho | equipamento, atividade ou visita? | descrever a atividade |
| Cachaça | produto brasileiro | manter "cachaça" |
| Vivência | participar ou observar? | "experience"/"expérience"/"Erlebnis" |
| Trilha × rota | caminhada, estrada ou temática? | trilha = trail/sentier/Wanderweg; rota = route/itinéraire/Route |
| Agricultura familiar | definição do cadastro | explicar, não trocar por classificação estrangeira |
| Município | divisão brasileira | municipality / commune / Gemeinde |

## Formato de cada entrada do glossário (para o admin)
chave estável · termo original · definição no projeto · contexto · tradução por idioma · o que preservar · exemplo real · quem revisou e quando.

## Provas que já existem / faltam
Existem (seção `idiomas`): paridade de chaves e variáveis, sem U+FFFD, cobertura dos 630 lugares, **catálogo cobre todos os nomes dos dados**, troca com ficha aberta, volta ao português. Faltam: singular/plural/zero em FR/DE, textos longos no celular (DE/FR), aprovação de falantes nativos, aviso de termo novo vindo do admin sem tradução.
