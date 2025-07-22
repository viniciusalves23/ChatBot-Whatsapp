// leitor de qr code
const qrcode = require("qrcode-terminal")
const { Client, Buttons, List, MessageMedia } = require("whatsapp-web.js")
const client = new Client()

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true })
})

client.on("ready", () => {
  console.log("Tudo certo! WhatsApp conectado.")
})

client.initialize()

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

// Função para identificar erros comuns de digitação
function isGreeting(text) {
  const greetings = [
    "ola",
    "olá",
    "oal",
    "alo",
    "alô",
    "oi",
    "oii",
    "oie",
    "bom dia",
    "boa tarde",
    "boa noite",
    "hello",
    "hi",
    ".",
    ",",
    "menu",
  ]
  const normalized = text.toLowerCase().replace(/[^a-záéíóúãõâêîôûç\s]/gi, "")
  return greetings.some((g) => normalized.includes(g))
}

// Função para identificar pedido de suporte
function isSupportRequest(text) {
  const supportWords = [
    "suporte",
    "atendente",
    "humano",
    "ajuda",
    "problema",
    "falar com alguém",
    "atendimento",
    "funcionario",
    "pessoa",
    "equipe",
  ]
  const normalized = text.toLowerCase()
  return supportWords.some((w) => normalized.includes(w))
}

// Função para identificar pedido de catálogo
function isCatalogRequest(text) {
  const catalogWords = ["catálogo", "catalogo", "lista", "ver catálogo", "ver catalogo", "novidades"]
  const normalized = text.toLowerCase()
  return catalogWords.some((w) => normalized.includes(w))
}

// Função para identificar pedido de política
function isPolicyRequest(text) {
  const policyWords = [
    "política",
    "politica",
    "troca",
    "devolução",
    "garantia",
    "prazo",
    "entrega",
    "pagamento",
    "formas de pagamento",
    "pix",
    "cartão",
  ]
  const normalized = text.toLowerCase()
  return policyWords.some((w) => normalized.includes(w))
}

// Função para verificar horário de atendimento
function isWithinBusinessHours() {
  const now = new Date()
  const hour = now.getHours()
  return hour >= 8 && hour < 18
}

// Função para detectar se um atendente humano assumiu o chat
function isHumanAttendant(text) {
  return /aqui é (vinicius|maria)/i.test(text)
}

// Função para detectar pedido de atendimento humano
function isRequestHuman(text) {
  return /(suporte|atendimento|falar com atendente|falar com humano)/i.test(text)
}

// Função para detectar encerramento do atendimento humano
function isHumanEndSession(text) {
  const endWords = [
    "#bot",
    "#automatico",
    "#encerrar",
    "#finalizar",
    "#bot_ativo",
    "bot ativo",
    "ativar bot",
    "voltar bot",
    "bot automatico",
  ]
  const normalized = text.toLowerCase()
  return endWords.some((w) => normalized.includes(w))
}

// Estado do cliente (simples, pode ser expandido para banco de dados)
const userState = {}
const humanAttending = {}

client.on("message", async (msg) => {
  const chat = await msg.getChat()
  const contact = await msg.getContact()
  const name = contact.pushname ? contact.pushname.split(" ")[0] : "cliente"
  const from = msg.from

  // Detecta se um atendente humano assumiu o chat
  if (isHumanAttendant(msg.body)) {
    humanAttending[from] = true
    return
  }

  // Detecta encerramento do atendimento humano (PALAVRAS-CHAVE PARA FUNCIONÁRIOS)
  if (isHumanEndSession(msg.body)) {
    humanAttending[from] = false
    userState[from] = { step: 1, pedido: null, dados: null, pagamento: false, foraHorario: false }
    await delay(1000)
    await client.sendMessage(
      from,
      `🤖 *Bot reativado!* Agora posso te ajudar novamente.\n\nSe precisar de algo, pode me chamar ou digite *menu* para ver as opções! 😊`,
    )
    return
  }

  // Detecta pedido de atendimento humano
  if (isRequestHuman(msg.body)) {
    const dentroHorario = isWithinBusinessHours()
    if (dentroHorario) {
      humanAttending[from] = true
      await client.sendMessage(
        from,
        `👩‍💼 Encaminhando para atendimento humano! Aguarde que um atendente irá te responder em breve.`,
      )
    } else {
      await delay(1500)
      await chat.sendStateTyping()
      await delay(2000)
      await client.sendMessage(
        from,
        `⏰ *Atendimento Humano Indisponível*\n\nNosso suporte humanizado funciona das *08:00 às 22:00*.\n\nNo momento estamos fora do horário de atendimento. Assim que abrirmos, nosso time estará disponível!\n\nEnquanto isso, posso te ajudar com informações básicas. Digite *menu* para ver as opções.`,
      )
      // INICIALIZA O ESTADO CORRETAMENTE
      if (!userState[from]) {
        userState[from] = { step: 1, pedido: null, dados: null, pagamento: false, foraHorario: false }
      } else {
        userState[from].step = 1
      }
    }
    return
  }

  // Se humano está atendendo, não responde mais (EXCETO se for produto do catálogo)
  if (humanAttending[from]) {
    // EXCEÇÃO: Se cliente enviar produto do catálogo mesmo durante atendimento humano
    if (
      msg.body.includes("Olá! Gostaria de comprar o produto:") ||
      msg.body.includes("Gostaria de comprar o produto:") ||
      (msg.body.includes("Tamanho:") && msg.body.includes("Quantidade:") && msg.body.includes("Preço:")) ||
      (msg.body.includes("Link do Produto:") && msg.body.includes("catalogo-vmshop.vercel.app"))
    ) {
      // Informa que há um novo pedido mas mantém atendimento humano
      await delay(1000)
      await client.sendMessage(
        from,
        `🔔 *Novo produto selecionado detectado!*\n\nVejo que você selecionou outro produto. Um atendente irá te ajudar com este novo pedido também!`,
      )
    }
    return
  }

  // Estado inicial
  if (!userState[from]) userState[from] = { step: 0, pedido: null, dados: null, pagamento: false, foraHorario: false }

  // Verifica horário de atendimento
  const dentroHorario = isWithinBusinessHours()

  // SUPORTE HUMANO
  if (isSupportRequest(msg.body)) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)

    // Verifica se está dentro do horário comercial
    if (dentroHorario) {
      await client.sendMessage(
        from,
        `Você deseja falar com alguém do nosso time de atendimento?\n\n1️⃣ Sim, quero falar com um atendente humano\n2️⃣ Não, quero continuar com o atendimento automático`,
      )
      userState[from].step = "suporte"
    } else {
      await client.sendMessage(
        from,
        `⏰ *Atendimento Humano Indisponível*\n\nNosso suporte humanizado funciona das *08:00 às 22:00*.\n\nNo momento estamos fora do horário de atendimento, mas você pode:\n\n🤖 Continuar usando o atendimento automático\n📱 Fazer seu pedido normalmente (dados ficam registrados)\n📋 Acessar informações e políticas da loja\n\n💬 Assim que abrirmos amanhã, nosso time estará disponível para te atender!\n\nDigite *menu* para ver as opções disponíveis.`,
      )
      // INICIALIZA O ESTADO CORRETAMENTE
      if (!userState[from]) {
        userState[from] = { step: 1, pedido: null, dados: null, pagamento: false, foraHorario: false }
      } else {
        userState[from].step = 1
      }
    }
    return
  }

  if (userState[from].step === "suporte") {
    if (msg.body.trim() === "1") {
      humanAttending[from] = true
      await delay(1500)
      await chat.sendStateTyping()
      await delay(2000)
      await client.sendMessage(
        from,
        `Ok! Em breve um atendente humano irá te responder por aqui. Aguarde um momento, por favor. 🙋‍♂️`,
      )
      userState[from].step = 0
      return
    }
    if (msg.body.trim() === "2") {
      await delay(1500)
      await chat.sendStateTyping()
      await delay(2000)
      await client.sendMessage(
        from,
        `Sem problemas! Pode continuar sua conversa normalmente. Se precisar de ajuda, é só chamar!`,
      )
      userState[from].step = 0
      return
    }
  }

  // INÍCIO DO FLUXO
  if (userState[from].step === 0 && (isGreeting(msg.body) || msg.body.length <= 3)) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    if (dentroHorario) {
      await client.sendMessage(
        from,
        `Olá! Tudo bem? 😊\nEu sou o *Atendente Virtual* da V&M SHOP.\n\n👉 Acesse nosso catálogo completo com as melhores novidades e preços especiais:\nhttps://catalogo-vmshop.vercel.app/\n\n⬆️ Tênis de alta qualidade e preços de fábrica.\n📦 Prazo de entrega: 7 a 20 dias úteis.\n💰 Formas de pagamento: PIX, Cartão de Crédito/Débito e Boleto\n\nDigite *menu* para ver as opções.`,
      )
    } else {
      await client.sendMessage(
        from,
        `⏰Olá! Tudo bem? 😊\nEu sou o *Atendente Virtual* da *V&M SHOP*.\n\nNosso atendimento humanizado funciona das 08:00 às 22:00.\nMas posso te ajudar com dúvidas básicas e informações!\n\n👉 Digite *menu* para ver opções, acessar o catálogo, políticas ou tirar dúvidas.\n\nSe quiser iniciar um pedido, pode enviar normalmente e continuaremos o atendimento até a coleta dos dados de entrega. O link de pagamento só pode ser enviado por um atendente humano durante o horário comercial.`,
      )
      userState[from].foraHorario = true
    }
    userState[from].step = 1
    return
  }

  // FLUXO DE PEDIDO - Detecta mensagem do catálogo (PRIORIDADE MÁXIMA)
  if (
    msg.body.includes("Olá! Gostaria de comprar o produto:") ||
    msg.body.includes("Gostaria de comprar o produto:") ||
    (msg.body.includes("Tamanho:") && msg.body.includes("Quantidade:") && msg.body.includes("Preço:")) ||
    (msg.body.includes("Link do Produto:") && msg.body.includes("catalogo-vmshop.vercel.app"))
  ) {
    const linkMatch = msg.body.match(/https:\/\/catalogo-vmshop\.vercel\.app\/product\/[a-zA-Z0-9-]+/)
    userState[from].pedido = msg.body
    userState[from].produtoLink = linkMatch ? linkMatch[0] : null

    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
      `✅ *Confirmação do Pedido*\n\nVocê selecionou o produto acima. Está tudo certo com as informações do seu pedido (modelo, cor, tamanho e quantidade)?\n\n👉 Responda com uma das opções abaixo:\n\n1️⃣ Digite 1 para *Sim, tudo certo*.\n2️⃣ Digite 2 para *Não, quero corrigir*.\n\n⚠️ Atenção na hora de escolher seu número, pois não realizamos trocas por erro na escolha da numeração. Nossos produtos seguem rigoroso padrão de qualidade e são conferidos antes do envio. Por isso, trocas só serão realizadas em casos raros de defeito de fabricação.`,
    )
    userState[from].step = 2
    return
  }

  // CATÁLOGO - só responde se NÃO for um produto específico
  if (isCatalogRequest(msg.body) && !msg.body.includes("catalogo-vmshop.vercel.app")) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
      `Confira nosso catálogo completo com as melhores novidades e preços especiais:\nhttps://catalogo-vmshop.vercel.app/\n\nPara comprar, envie o nome do produto, modelo, tamanho e quantidade.`,
    )
    userState[from].step = 1
    return
  }

  // POLÍTICAS
  if (isPolicyRequest(msg.body)) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
`📝 *Políticas V&M SHOP*\n\n- Trocas: Só realizamos trocas em casos raros de defeito de fabricação. Atenção ao escolher o modelo, cor e tamanho do seu tênis!\n- Prazo de entrega: 7 a 20 dias úteis após postagem.\n- Pagamento: PIX, Cartão de Crédito/Débito ou Boleto.\n- Políticas: Você pode conferir nossas políticas com mais detalhes em: https://catalogo-vmshop.vercel.app/policies\n\nDigite *menu* para voltar ao menu inicial`,    )
    return
  }

  // Correção do pedido
  if (userState[from].step === 2) {
    if (msg.body.trim() === "1") {
      await delay(1500)
      await chat.sendStateTyping()
      await delay(2000)
      await client.sendMessage(
        from,
        `Ótima escolha! 😁👟 Com certeza você está garantindo um produto que poucos têm acesso!\n\nAgora vamos prosseguir com o seu pedido 👇\n\n📦🚚 Preencha os seguintes dados para uma entrega com segurança:\n\n1️⃣ Nome completo\n2️⃣ CPF\n3️⃣ CEP\n4️⃣ Endereço completo (rua, número, bairro, cidade, estado)\n\n📦 A postagem é feita em até 2 dias úteis após o pagamento.\n🚚 Prazo de entrega total: 7 a 20 dias úteis.`,
      )
      userState[from].step = 3
      return
    }
    if (msg.body.trim() === "2") {
      await delay(1500)
      await chat.sendStateTyping()
      await delay(2000)
      const linkMsg = userState[from].produtoLink
        ? `\n\nLink do produto selecionado: ${userState[from].produtoLink}`
        : ""
      await client.sendMessage(
        from,
        `Certo! Neste caso, basta você se dirigir até o produto informado e editar as informações conforme deseja.${linkMsg}`,
      )
      userState[from].step = 1
      userState[from].pedido = null
      userState[from].produtoLink = null
      return
    }
    // Caso digite algo diferente
    await client.sendMessage(from, `Por favor, digite *1* para confirmar ou *2* para corrigir seu pedido.`)
    return
  }

  // Recebendo dados de entrega
  if (userState[from].step === 3 && msg.body.length > 10) {
    userState[from].dados = msg.body
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)

    // Verifica se está dentro do horário comercial
    if (dentroHorario) {
      await client.sendMessage(
        from,
        `📦 Ótimo! Já registramos suas informações de entrega!\n\nAgora vou te encaminhar para um atendente do nosso time para continuar o processo de pagamento. O link do Mercado Pago será enviado por um atendente humano em instantes, pois o sistema automatizado não tem capacidade de gerar links de pagamento - isso só pode ser feito pelo suporte humanizado!\n\nSe quiser tirar dúvidas ou acessar informações, digite *menu*.`,
      )
      userState[from].step = 0
      humanAttending[from] = true // Encaminha para atendimento humano APENAS durante horário comercial
    } else {
      await client.sendMessage(
        from,
        `📦 Ótimo! Já registramos suas informações de entrega!\n\n⏰ *Horário de Atendimento:* Como estamos fora do horário comercial (08:00 às 22:00), o link de pagamento só poderá ser enviado por um atendente humano durante o funcionamento da loja.\n\n🕐 Seu pedido ficará registrado e assim que iniciarmos o atendimento amanhã, um de nossos atendentes irá te contactar para finalizar o pagamento via Mercado Pago.\n\n💤 Pode ficar tranquilo que seu produto está reservado! Se quiser tirar dúvidas ou acessar informações, digite *menu*.`,
      )
      userState[from].step = 1 // MANTÉM BOT ATIVO fora do horário comercial
      // NÃO define humanAttending = true quando fora do horário
    }
    return
  }

  // Confirmação de pagamento
  if (
    userState[from].step === 4 &&
    msg.body.match(/(paguei|pagamento feito|já paguei|pago|efetuei o pagamento|comprovante)/i)
  ) {
    userState[from].pagamento = true
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
      `✅ PAGAMENTO CONFIRMADO ✅\n\n🎉 Obrigado pela sua compra! 🎉\n\nSeu pedido já está sendo processado e pode ter certeza que você fez uma ótima escolha!\n\nNossos produtos são de qualidade premium e pensados para quem realmente entende do assunto. 😉\n\n🚚🔍 Assim que seu pedido for postado, te enviamos o código de rastreio por aqui mesmo!\n\nFicou com alguma dúvida❔\nÉ só me chamar! Estou sempre por aqui pra te ajudar. 💬`,
    )
    userState[from].step = 5
    return
  }

  // Postagem do pedido (simulação)
  if (
    userState[from].step === 5 &&
    msg.body.match(/(rastreio|código|postado|envio|enviado|cadê meu pedido|cadastro de rastreio)/i)
  ) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
      `📦 Seu pedido foi postado! 🚀\n\nOlá! Passando pra avisar que o seu produto já foi enviado com sucesso! 😄\n\nAgora é só acompanhar a entrega pelo código de rastreio abaixo:\n\n🔍 Código de rastreio: XXX\n🌐 Acompanhe sua entrega aqui: https://www2.correios.com.br/sistemas/rastreamento/\n\n📅 Prazo estimado de entrega: de 7 a 20 dias úteis, conforme informado.\n\nFica de olho por aqui que qualquer atualização também te avisamos! 💬\nQualquer dúvida, é só chamar! 🤝💚\nV&M SHOP agradece a sua compra!`,
    )
    userState[from].step = 0
    userState[from].pedido = null
    userState[from].dados = null
    userState[from].pagamento = false
    return
  }

  // MENU DE OPÇÕES
  if (msg.body.match(/menu/i)) {
    await delay(1500)
    await chat.sendStateTyping()
    await delay(2000)
    await client.sendMessage(
      from,
      `🛒 *Menu V&M SHOP*\n\n1️⃣ Ver catálogo\n2️⃣ Saber como funciona a compra\n3️⃣ Ver políticas da loja\n4️⃣ Falar com atendente humano\n5️⃣ Dúvidas sobre entrega/pagamento\n\nDigite o número da opção desejada.`,
    )
    userState[from].step = "menu"
    return
  }
  if (userState[from].step === "menu") {
    switch (msg.body.trim()) {
      case "1":
        await client.sendMessage(from, `Confira nosso catálogo completo:\nhttps://catalogo-vmshop.vercel.app/`)
        userState[from].step = 1
        break
      case "2":
        await client.sendMessage(
          from,
          `🛒 *Como funciona a compra na V&M SHOP?*\n\n1️⃣ Acesse nosso catálogo: https://catalogo-vmshop.vercel.app/\n2️⃣ Escolha o produto (modelo, cor, tamanho, quantidade) e clique em *Comprar via WhatsApp*.\n3️⃣ O produto será compartilhado automaticamente aqui na conversa.\n4️⃣ Envie seus dados de entrega (nome, CPF, CEP, endereço completo).\n5️⃣ Receba o link de pagamento do Mercado Pago para finalizar a compra.\n6️⃣ Após o pagamento, seu pedido é postado em até 2 dias úteis e você recebe o código de rastreio!\n\nDigite *menu* para voltar para o menu inicial.`,
        )
        userState[from].step = 1
        break
      case "3":
        await client.sendMessage(
          from,
          `📝 *Políticas V&M SHOP*\n\n- Trocas: Só realizamos trocas em casos raros de defeito de fabricação. Atenção ao escolher o número do seu tênis!\n- Prazo de entrega: 7 a 20 dias úteis após postagem.\n- Pagamento: Apenas PIX ou cartão de crédito à vista (1x, via link de pagamento).\n- Garantia: Produtos seguem rigoroso padrão de qualidade e são conferidos antes do envio.`,
        )
        userState[from].step = 1
        break
      case "4":
        const dentroHorarioMenu = isWithinBusinessHours()
        if (dentroHorarioMenu) {
          await client.sendMessage(from, `Você deseja falar com alguém do nosso time de atendimento?\n\n1️⃣ Sim\n2️⃣ Não`)
          userState[from].step = "suporte"
        } else {
          await client.sendMessage(
            from,
            `⏰ *Atendimento Humano Indisponível*\n\nNosso suporte humanizado funciona das *08:00 às 22:00*.\n\nNo momento estamos fora do horário de atendimento. Assim que abrirmos, nosso time estará disponível!\n\nEnquanto isso, posso te ajudar com informações básicas. Digite *menu* para ver as opções.`,
          )
          userState[from].step = 1
        }
        break
      case "5":
        await client.sendMessage(
          from,
`📝 *Políticas V&M SHOP*\n\n- Trocas: Só realizamos trocas em casos raros de defeito de fabricação. Atenção ao escolher o modelo, cor e tamanho do seu tênis!\n- Prazo de entrega: 7 a 20 dias úteis após postagem.\n- Pagamento: PIX, Cartão de Crédito/Débito ou Boleto.\n- Políticas: Você pode conferir nossas políticas com mais detalhes em: https://catalogo-vmshop.vercel.app/policies\n\nDigite *menu* para voltar ao menu inicial`,        )
        userState[from].step = 1
        break
      default:
        await client.sendMessage(from, `Por favor, digite o número da opção desejada.`)
    }
    return
  }

  // Resposta padrão para mensagens não reconhecidas
  if (msg.body.length < 3) {
    await client.sendMessage(
      from,
      `Olá! Não entendi sua mensagem. Por favor, envie sua dúvida ou digite *menu* para ver opções.`,
    )
    return
  }

  // Dúvidas gerais
  if (msg.body.match(/(duvida|dúvida|pergunta|info|informação|informacoes|informações)/i)) {
    await client.sendMessage(from, `Pode enviar sua dúvida! Se quiser ver o menu de opções, digite *menu*.`)
    return
  }

  // Fallback para qualquer outro cenário
  await client.sendMessage(
    from,
    `Olá! Não entendi sua mensagem. Por favor, envie sua dúvida, o nome do produto que deseja comprar, ou digite *menu* para ver opções.`,
  )
})
