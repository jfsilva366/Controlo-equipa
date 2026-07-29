# Controlo de Equipa

Aplicação interna multiutilizador para planeamento e acompanhamento operacional.

## Funcionalidades

- Autenticação individual com Supabase Auth
- Perfis de administrador e colaborador
- Quadro Kanban: Por iniciar, Em curso, A validar e Concluída
- Sincronização em tempo real
- RLS: colaboradores apenas veem e atualizam as próprias tarefas
- Gestão de acessos por email autorizado
- Histórico de alterações
- Anexos privados até 6 MB
- Exportação CSV
- Interface responsiva para computador e telemóvel

## Publicação

O projeto é estático. No Netlify, liga este repositório e deixa o diretório de publicação como `.`. Não é necessário comando de build.

## Primeiro acesso

Cria uma conta com `jfsilva366@gmail.com`. Esse email foi autorizado como administrador na migração inicial. Dependendo da configuração do Supabase Auth, pode ser necessário confirmar o email antes do primeiro login.
