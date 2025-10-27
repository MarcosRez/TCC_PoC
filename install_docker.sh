#!/bin/bash
# Script para instalar Docker no Ubuntu 22.04
# Autor: Marcos Rezende

# Atualiza os pacotes
echo "🔄 Atualizando pacotes do sistema..."
sudo apt update -y && sudo apt upgrade -y

# Remove versões antigas
echo "🧹 Removendo versões antigas do Docker..."
sudo apt remove -y docker docker-engine docker.io containerd runc

# Instala dependências necessárias
echo "📦 Instalando dependências..."
sudo apt install -y ca-certificates curl gnupg lsb-release apt-transport-https software-properties-common

# Adiciona a chave GPG oficial do Docker
echo "🔑 Adicionando chave GPG do Docker..."
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Adiciona o repositório oficial do Docker
echo "➕ Adicionando repositório Docker ao APT..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Atualiza os pacotes novamente
echo "🔄 Atualizando lista de pacotes..."
sudo apt update -y

# Instala o Docker Engine, CLI e containerd
echo "🐳 Instalando Docker Engine..."
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Habilita e inicia o serviço do Docker
echo "🚀 Habilitando e iniciando o serviço Docker..."
sudo systemctl enable docker
sudo systemctl start docker

# Adiciona o usuário atual ao grupo docker (para rodar sem sudo)
echo "👤 Adicionando o usuário atual ao grupo docker..."
sudo usermod -aG docker $USER

# Testa a instalação
echo "✅ Testando o Docker..."
docker --version
docker run hello-world

echo "🎉 Instalação concluída com sucesso!"
