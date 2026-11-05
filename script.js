
const SUPABASE_URL = "https://uyuixmxsugmeyfuajdyc.supabase.co";
const SUPABASE_KEY = "sb_publishable_CdAV7dFHKzU7SgFgJUw7Dw_EmcclzU0";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/account-manager`;

// ELEMENTOS DAS TELAS
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");

const loginForm = document.getElementById("login-form");
const message = document.getElementById("message");

// USUÁRIO ATUAL
let currentUser = null;

// COMUNICAÇÃO COM A EDGE FUNCTION
async function callAccountManager(data, accessToken = null) {
    const headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Ocorreu um erro.");
    }

    return result;
}

// MOSTRAR O PAINEL
function showDashboard(user) {
    currentUser = user;

    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");

    document.getElementById("user-name").textContent =
        user.username;

    document.getElementById("user-role").textContent =
        user.role === "coordenador" ? "Coordenador" : "Ministro";

    const addButton = document.getElementById("add-event-button");

    if (user.role === "coordenador") {
        addButton.classList.remove("hidden");
    } else {
        addButton.classList.add("hidden");
    }

    loadCelebrations();
    // Mostrar solicitações apenas ao coordenador principal
    const resetSection = document.getElementById("reset-requests-section");

    if (user.is_super_admin) {
        resetSection.classList.remove("hidden");
        loadResetRequests();
    } else {
        resetSection.classList.add("hidden");
    }
    // Mostrar gerenciamento de usuários apenas ao coordenador principal
    const usersSection = document.getElementById("users-section");

    if (user.is_super_admin) {
        usersSection.classList.remove("hidden");
        loadUsers();
    } else {
        usersSection.classList.add("hidden");
    }
}

// ABRIR TELA DE PERFIL
document.getElementById("profile-button")
    .addEventListener("click", () => {

        if (!currentUser) return;

        document.getElementById("dashboard-screen")
            .classList.add("hidden");

        document.getElementById("profile-screen")
            .classList.remove("hidden");

        document.getElementById("profile-username").textContent =
            currentUser.username;

        document.getElementById("profile-role").textContent =
            currentUser.is_super_admin
                ? "Coordenador principal"
                : currentUser.role === "coordenador"
                    ? "Coordenador"
                    : "Ministro";
    });


// VOLTAR AO PAINEL
document.getElementById("back-to-dashboard")
    .addEventListener("click", () => {

        document.getElementById("profile-screen")
            .classList.add("hidden");

        document.getElementById("dashboard-screen")
            .classList.remove("hidden");

        document.getElementById("profile-message").textContent = "";
        document.getElementById("change-password-form").reset();
    });

// ALTERAR A PRÓPRIA SENHA
document.getElementById("change-password-form")
    .addEventListener("submit", async (event) => {

        event.preventDefault();

        const message = document.getElementById("profile-message");

        const newPassword =
            document.getElementById("new-password").value;

        const confirmPassword =
            document.getElementById("confirm-password").value;

        if (newPassword.length < 6) {
            message.textContent =
                "A senha precisa ter pelo menos 6 caracteres.";
            return;
        }

        if (newPassword !== confirmPassword) {
            message.textContent =
                "As senhas não coincidem.";
            return;
        }

        message.textContent = "Alterando senha...";

        try {
            const { data: sessionData } =
                await supabaseClient.auth.getSession();

            const token = sessionData.session?.access_token;

            if (!token) {
                throw new Error("Sessão não encontrada.");
            }

            const result = await callAccountManager(
                {
                    action: "change_password",
                    password: newPassword
                },
                token
            );

            message.textContent = result.message;

            document.getElementById("change-password-form").reset();

        } catch (error) {
            console.error("Erro ao alterar senha:", error);

            message.textContent =
                error.message || "Não foi possível alterar a senha.";
        }
    });

// MOSTRAR LOGIN
function showLogin() {
    currentUser = null;

    dashboardScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
}

// BUSCAR PERFIL
async function loadUserProfile(userId) {
    const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username, role, is_super_admin")
        .eq("id", userId)
        .single();

    if (error) throw error;

    return {
        id: data.id,
        username: data.username,
        role: data.role,
        is_super_admin: data.is_super_admin
    };
}

// REALIZAR LOGIN
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document
        .getElementById("login-username")
        .value.trim();

    const password = document
        .getElementById("login-password")
        .value;

    message.textContent = "Entrando...";

    try {
        const result = await callAccountManager({
            action: "login",
            username,
            password
        });

        const { data: sessionData, error } =
            await supabaseClient.auth.setSession({
                access_token: result.access_token,
                refresh_token: result.refresh_token
            });

        if (error) throw error;

        const user = await loadUserProfile(
            sessionData.session.user.id
        );

        showDashboard(user);

        message.textContent = "";

    } catch (error) {
        message.textContent = error.message;
    }
});

// ENCERRAR SESSÃO
document.getElementById("logout-button").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();

    loginForm.reset();
    message.textContent = "";

    showLogin();
});

// CARREGAR CELEBRAÇÕES

async function loadCelebrations() {
    const list = document.getElementById("celebrations-list");

    list.innerHTML = `
        <p class="empty-message">Carregando celebrações...</p>
    `;

    try {
        const { data: celebrations, error } = await supabaseClient
            .from("celebrations")
            .select("*")
            .order("event_date", { ascending: true });

        if (error) throw error;

        if (!celebrations || celebrations.length === 0) {
            list.innerHTML = `
                <p class="empty-message">
                    Nenhuma celebração cadastrada ainda.
                </p>
            `;
            return;
        }

        const { data: profiles, error: profilesError } =
            await supabaseClient
                .from("profiles")
                .select("id, username");

        if (profilesError) throw profilesError;

        const users = {};

        profiles.forEach(profile => {
            users[profile.id] = profile.username;
        });

        list.innerHTML = "";

        celebrations.forEach(celebration => {
            const isAssigned =
                celebration.assigned_minister_id !== null;

            const isMyAssignment =
                currentUser &&
                celebration.assigned_minister_id === currentUser.id;

            const card = document.createElement("div");

            card.className = `celebration-card ${
                isAssigned ? "assigned-card" : "free-card"
            }`;

            const date = new Date(
                celebration.event_date + "T12:00:00"
            );

            const formattedDate = date.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });

            const eventType =
                celebration.event_type === "missa"
                    ? "Missa"
                    : "Celebração";

            const creator =
                users[celebration.created_by] || "Usuário desconhecido";

            const minister = isAssigned
                ? users[celebration.assigned_minister_id] || "Usuário desconhecido"
                : "Disponível";

            let actionButton = "";
            if (currentUser && currentUser.role === "coordenador") {
                actionButton += `
                    <button class="delete-button">
                        Excluir
                    </button>
                `;
            }

            if (!isAssigned &&(!currentUser.is_super_admin || currentUser.role === "ministro")) {
                actionButton += `
                    <button class="primary-button claim-button">
                        Assumir
                    </button>
                `;
            } else if (isMyAssignment) {
                actionButton += `
                    <button class="secondary-button release-button">
                        Liberar minha data
                    </button>
                `;
            }

            card.innerHTML = `
                <div class="celebration-date">
                    <h3>${formattedDate}</h3>
                    <span>${eventType}</span>
                </div>

                <div class="celebration-details">
                    <p>
                        <strong>Cadastrada por:</strong>
                        ${escapeHTML(creator)}
                    </p>

                    <p>
                        <strong>Ministro:</strong>
                        ${escapeHTML(minister)}
                    </p>
                </div>

                <span class="status-label">
                    ${isAssigned ? "Assumida" : "Disponível"}
                </span>

                <div class="celebration-actions">
                    ${actionButton}
                </div>
            `;

            const claimButton = card.querySelector(".claim-button");

            if (claimButton) {
                claimButton.addEventListener("click", async () => {
                    try {
                        const { error } = await supabaseClient.rpc(
                            "claim_celebration",
                            {
                                p_celebration_id: celebration.id
                            }
                        );

                        if (error) throw error;

                        await loadCelebrations();

                    } catch (error) {
                        console.error("Erro ao assumir celebração:", error);
                        alert(error.message || "Não foi possível assumir esta data.");
                        await loadCelebrations();
                    }
                });
            }

            const releaseButton = card.querySelector(".release-button");

            if (releaseButton) {
                releaseButton.addEventListener("click", async () => {
                    const confirmed = confirm(
                        "Deseja realmente liberar esta data?"
                    );

                    if (!confirmed) return;

                    try {
                        const { error } = await supabaseClient.rpc(
                            "release_celebration",
                            {
                                p_celebration_id: celebration.id
                            }
                        );

                        if (error) throw error;

                        await loadCelebrations();

                    } catch (error) {
                        console.error("Erro ao liberar celebração:", error);
                        alert(error.message || "Não foi possível liberar esta data.");
                        await loadCelebrations();
                    }
                });
            }
            // NOVO BLOCO: EXCLUIR CELEBRAÇÃO
            const deleteButton = card.querySelector(".delete-button");

            if (deleteButton) {
                deleteButton.addEventListener("click", async () => {

                    const confirmed = confirm(
                        "Tem certeza de que deseja excluir esta celebração?"
                    );

                    if (!confirmed) return;

                    try {
                        const { error } = await supabaseClient
                            .from("celebrations")
                            .delete()
                            .eq("id", celebration.id);

                        if (error) throw error;

                        await loadCelebrations();

                    } catch (error) {
                        console.error("Erro ao excluir celebração:", error);

                        alert(
                            error.message || "Não foi possível excluir esta celebração."
                        );
                    }
                });
            }

            list.appendChild(card);
        });

    } catch (error) {
        console.error("Erro ao carregar celebrações:", error);

        list.innerHTML = `
            <p class="empty-message">
                Não foi possível carregar as celebrações.
                Verifique sua conexão e tente novamente.
            </p>
        `;
    }
}



// CARREGAR SOLICITAÇÕES DE RECUPERAÇÃO DE SENHA
async function loadResetRequests() {
    const container = document.getElementById("reset-requests-list");

    container.innerHTML = `
        <p class="empty-message">
            Carregando solicitações...
        </p>
    `;

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const token = sessionData.session?.access_token;

        if (!token) {
            throw new Error("Sessão não encontrada.");
        }

        const result = await callAccountManager(
            { action: "list_reset_requests" },
            token
        );

        if (!result.requests || result.requests.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    Nenhuma solicitação pendente.
                </p>
            `;
            return;
        }

        container.innerHTML = result.requests.map(request => `
            <div class="celebration-card">
                <h4>${escapeHTML(request.username)}</h4>

                <p>
                    Solicitação recebida em:
                    ${new Date(request.created_at).toLocaleString("pt-BR")}
                </p>

                <button
                    class="primary-button"
                    onclick="resolveResetRequest('${request.id}', '${escapeHTML(request.username)}')">
                    Redefinir senha
                </button>
            </div>
        `).join("");

    } catch (error) {
        console.error("Erro ao carregar solicitações:", error);

        container.innerHTML = `
            <p class="empty-message">
                Não foi possível carregar as solicitações.
            </p>
        `;
    }
}



// CARREGAR USUÁRIOS CADASTRADOS
async function loadUsers() {
    const container = document.getElementById("users-list");

    container.innerHTML = `
        <p class="empty-message">
            Carregando usuários...
        </p>
    `;

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const token = sessionData.session?.access_token;

        if (!token) {
            throw new Error("Sessão não encontrada.");
        }

        const result = await callAccountManager(
            { action: "list_users" },
            token
        );

        if (!result.users || result.users.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    Nenhum usuário cadastrado.
                </p>
            `;
            return;
        }

        container.innerHTML = result.users.map(user => `
            <div class="celebration-card">
                <h4>${escapeHTML(user.username)}</h4>

                <p>
                    Tipo de conta:
                    ${user.role === "coordenador" ? "Coordenador" : "Ministro"}
                </p>

                <p>
                    ${user.is_super_admin
                        ? "Coordenador principal"
                        : "Conta comum"}
                </p>

                ${user.id !== currentUser.id ? `
                    <button
                        class="delete-button"
                        data-user-id="${escapeHTML(user.id)}"
                        data-username="${escapeHTML(user.username)}">
                        Excluir conta
                    </button>
                ` : `
                    <p>Esta é a sua conta.</p>
                `}
            </div>
        `).join("");

        container.querySelectorAll(".delete-button").forEach(button => {
            button.addEventListener("click", () => {
                deleteUser(
                    button.dataset.userId,
                    button.dataset.username
                );
            });
        });

    } catch (error) {
        console.error("Erro ao carregar usuários:", error);

        container.innerHTML = `
            <p class="empty-message">
                Não foi possível carregar os usuários.
            </p>
        `;
    }
}



// EXCLUIR CONTA DE USUÁRIO
async function deleteUser(userId, username) {
    const confirmation = confirm(
        `Tem certeza de que deseja excluir a conta de ${username}?\n\n` +
        "As celebrações criadas por esse usuário também serão excluídas. " +
        "As atribuições dele serão liberadas."
    );

    if (!confirmation) return;

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const token = sessionData.session?.access_token;

        if (!token) {
            throw new Error("Sessão não encontrada.");
        }

        const result = await callAccountManager(
            {
                action: "delete_user",
                userId: userId
            },
            token
        );

        alert(result.message);

        // Atualizar as duas listas
        await loadUsers();
        await loadCelebrations();

    } catch (error) {
        console.error("Erro ao excluir usuário:", error);

        alert(
            error.message ||
            "Não foi possível excluir essa conta."
        );
    }
}



// REDEFINIR SENHA DE UM USUÁRIO
async function resolveResetRequest(requestId, username) {
    const newPassword = prompt(
        `Digite a nova senha para ${username}:`
    );

    if (newPassword === null) return;

    if (newPassword.length < 6) {
        alert("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    const confirmation = confirm(
        `Deseja realmente redefinir a senha de ${username}?`
    );

    if (!confirmation) return;

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const token = sessionData.session?.access_token;

        const result = await callAccountManager(
            {
                action: "resolve_reset",
                requestId: requestId,
                password: newPassword
            },
            token
        );

        alert(result.message);
        await loadResetRequests();

    } catch (error) {
        console.error("Erro ao redefinir senha:", error);
        alert(error.message || "Não foi possível redefinir a senha.");
    }
}



// ABRIR FORMULÁRIO DE CADASTRO
document.getElementById("add-event-button")
    .addEventListener("click", () => {

        if (!currentUser || currentUser.role !== "coordenador") {
            return;
        }

        document.getElementById("event-form-container")
            .classList.remove("hidden");

        document.getElementById("event-message").textContent = "";
    });

// FECHAR FORMULÁRIO
document.getElementById("cancel-event-button")
    .addEventListener("click", () => {

        document.getElementById("event-form-container")
            .classList.add("hidden");

        document.getElementById("event-form").reset();

        document.getElementById("event-message").textContent = "";
    });

// CADASTRAR CELEBRAÇÃO
document.getElementById("event-form")
    .addEventListener("submit", async (event) => {

        event.preventDefault();

        const eventMessage =
            document.getElementById("event-message");

        if (!currentUser || currentUser.role !== "coordenador") {
            eventMessage.textContent =
                "Apenas coordenadores podem cadastrar celebrações.";
            return;
        }

        const eventDate =
            document.getElementById("event-date").value;

        const eventType =
            document.getElementById("event-type").value;

        eventMessage.textContent = "Salvando celebração...";

        try {
            const { error } = await supabaseClient
                .from("celebrations")
                .insert({
                    event_date: eventDate,
                    event_type: eventType,
                    created_by: currentUser.id
                });

            if (error) {
                if (error.code === "23505") {
                    throw new Error(
                        "Já existe uma celebração cadastrada nessa data."
                    );
                }

                throw error;
            }

            eventMessage.textContent =
                "Celebração cadastrada com sucesso!";

            document.getElementById("event-form").reset();

            await loadCelebrations();

        } catch (error) {
            console.error("Erro ao cadastrar celebração:", error);

            eventMessage.textContent =
                error.message || "Não foi possível cadastrar a celebração.";
        }
    });


    // ABRIR TELA DE RECUPERAÇÃO
    document.getElementById("forgot-password")
        .addEventListener("click", () => {

            document.getElementById("login-form")
                .classList.add("hidden");

            document.querySelector(".auth-links")
                .classList.add("hidden");

            document.getElementById("login-heading")
                .classList.add("hidden");

            document.getElementById("recovery-container")
                .classList.remove("hidden");
        });

    // VOLTAR DA RECUPERAÇÃO PARA O LOGIN
    document.getElementById("back-from-recovery")
        .addEventListener("click", () => {

            document.getElementById("recovery-container")
                .classList.add("hidden");

            document.getElementById("login-form")
                .classList.remove("hidden");

            document.querySelector(".auth-links")
                .classList.remove("hidden");

            document.getElementById("login-heading")
                .classList.remove("hidden");

            document.getElementById("recovery-form").reset();

            document.getElementById("recovery-message").textContent = "";
        });

    // ENVIAR SOLICITAÇÃO DE RECUPERAÇÃO
    document.getElementById("recovery-form")
        .addEventListener("submit", async (event) => {

            event.preventDefault();

            const message =
                document.getElementById("recovery-message");

            const username =
                document.getElementById("recovery-username").value.trim();

            message.textContent = "Enviando solicitação...";

            try {
                const result = await callAccountManager({
                    action: "request_reset",
                    username: username
                });

                message.textContent =
                    result.message ||
                    "Se a conta existir, a solicitação será encaminhada ao coordenador.";

                document.getElementById("recovery-form").reset();

            } catch (error) {
                console.error("Erro ao solicitar recuperação:", error);

                message.textContent =
                    "Não foi possível enviar a solicitação. Tente novamente.";
            }
        });

    // ABRIR TELA DE CADASTRO DE USUÁRIO
    document.getElementById("show-signup")
        .addEventListener("click", () => {

            document.getElementById("login-form")
                .classList.add("hidden");

            document.querySelector(".auth-links")
                .classList.add("hidden");

            document.getElementById("signup-container")
                .classList.remove("hidden");

            document.getElementById("login-heading")
                .classList.add("hidden");
        });

    // VOLTAR PARA O LOGIN
    document.getElementById("back-to-login")
        .addEventListener("click", () => {

            document.getElementById("signup-container")
                .classList.add("hidden");

            document.getElementById("login-form")
                .classList.remove("hidden");

            document.querySelector(".auth-links")
                .classList.remove("hidden");

            document.getElementById("login-heading")
                .classList.remove("hidden");

            document.getElementById("signup-form").reset();

            document.getElementById("signup-message").textContent = "";
        });

    // MOSTRAR CÓDIGO DE AUTORIZAÇÃO
    document.getElementById("signup-role")
        .addEventListener("change", (event) => {

            const codeContainer =
                document.getElementById("coordinator-code-container");

            const codeInput =
                document.getElementById("coordinator-code");

            if (event.target.value === "coordenador") {
                codeContainer.classList.remove("hidden");
                codeInput.required = true;
            } else {
                codeContainer.classList.add("hidden");
                codeInput.required = false;
                codeInput.value = "";
            }
        });

    
    // CADASTRAR NOVO USUÁRIO
    document.getElementById("signup-form")
    .addEventListener("submit", async (event) => {

        event.preventDefault();

        const message = document.getElementById("signup-message");

        const username =
            document.getElementById("signup-username").value.trim();

        const password =
            document.getElementById("signup-password").value;

        const role =
            document.getElementById("signup-role").value;

        const coordinatorCode =
            document.getElementById("coordinator-code").value;

        message.textContent = "Criando sua conta...";

        try {
            const result = await callAccountManager({
                action: "signup",
                username: username,
                password: password,
                role: role,
                coordinatorCode: role === "coordenador"
                    ? coordinatorCode
                    : undefined
            });

            message.textContent =
                result.message || "Conta criada com sucesso!";

            document.getElementById("signup-form").reset();

            document.getElementById("coordinator-code-container")
                .classList.add("hidden");

        } catch (error) {
            console.error("Erro ao cadastrar usuário:", error);

            message.textContent =
                error.message || "Não foi possível criar a conta.";
        }
    });


// PROTEGER TEXTO INSERIDO NO HTML
function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

// RESTAURAR SESSÃO
async function initializeApp() {
    try {
        const { data } = await supabaseClient.auth.getSession();

        if (data.session) {
            const user = await loadUserProfile(data.session.user.id);
            showDashboard(user);
        } else {
            showLogin();
        }

    } catch (error) {
        console.error("Erro ao restaurar sessão:", error);
        showLogin();
    }
}

initializeApp();
