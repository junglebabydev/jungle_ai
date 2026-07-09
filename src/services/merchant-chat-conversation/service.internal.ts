import { AI_PENDING_STATUS, AiConversation, AiPendingAction, AiTurn } from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  AppendTurnInput,
  CreateAiConversationInput,
  CreatePendingActionInput,
  IMerchantChatConversationServiceInternal,
} from "./service.interface";

async function createConversation(
  input: CreateAiConversationInput,
): Promise<AiConversation> {
  try {
    return await prisma.aiConversation.create({ data: input });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.AiConversation;
  }
}

async function getConversationById(id: number): Promise<AiConversation> {
  const row = await prisma.aiConversation.findUnique({ where: { id } });
  if (!row) throw NotFoundError.AiConversation;
  return row;
}

async function appendTurns(
  conversationId: number,
  turns: AppendTurnInput[],
): Promise<number> {
  if (turns.length === 0) {
    return prisma.aiTurn.count({ where: { conversationId } });
  }
  try {
    const existing = await prisma.aiTurn.count({ where: { conversationId } });
    await prisma.aiTurn.createMany({
      data: turns.map((t, i) => ({
        conversationId,
        sequence: existing + i,
        role: t.role,
        content: t.content,
        toolCallId: t.toolCallId ?? null,
        rawJson: t.rawJson,
      })),
    });
    return existing + turns.length;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.AiConversation;
  }
}

async function getRecentTurns(
  conversationId: number,
  limit: number,
): Promise<AiTurn[]> {
  try {
    const rows = await prisma.aiTurn.findMany({
      where: { conversationId },
      orderBy: { sequence: "desc" },
      take: limit,
    });
    return rows.reverse();
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.AiConversation;
  }
}

async function createPendingAction(
  input: CreatePendingActionInput,
): Promise<AiPendingAction> {
  try {
    return await prisma.aiPendingAction.create({
      data: {
        conversationId: input.conversationId,
        toolName: input.toolName,
        argsJson: input.argsJson,
        expiresAt: input.expiresAt,
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.AiPendingAction;
  }
}

async function getPendingByNonce(nonce: string): Promise<AiPendingAction> {
  const row = await prisma.aiPendingAction.findUnique({ where: { nonce } });
  if (!row) throw NotFoundError.AiPendingAction;
  return row;
}

async function resolvePendingAction(
  nonce: string,
  status: AI_PENDING_STATUS,
): Promise<AiPendingAction> {
  try {
    return await prisma.aiPendingAction.update({
      where: { nonce },
      data: { status, resolvedAt: new Date() },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.AiPendingAction;
  }
}

export const MerchantChatConversationServiceInternal: IMerchantChatConversationServiceInternal = {
  createConversation,
  getConversationById,
  appendTurns,
  getRecentTurns,
  createPendingAction,
  getPendingByNonce,
  resolvePendingAction,
};
