import { SlashCommandBuilder } from 'discord.js';
import db from '../services/db.js';
const command = {
    data: new SlashCommandBuilder().setName('status').setDescription('Verifica o status do bot'),
    async execute(interaction, _ctx) {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        let dbStatus = '❌ Desconectado';
        try {
            const pool = await db.initDB();
            await pool.query('SELECT 1');
            dbStatus = '✅ Conectado';
        }
        catch {
            // already defaulted to disconnected
        }
        await interaction.editReply({
            content: [
                `✅ Bot online!`,
                `**Uptime:** ${hours}h ${minutes}m ${seconds}s`,
                `**Banco de dados:** ${dbStatus}`,
            ].join('\n'),
            ephemeral: true,
        });
    },
};
export default command;
