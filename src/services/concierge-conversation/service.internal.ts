import { ConciergeConversation, ConciergeTurn } from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  AppendConciergeTurnInput,
  IConciergeConversationServiceInternal,
} from "./service.interface";

async function createConversation(
  model: string,
): Promise<ConciergeConversation> {
  try {
    return await prisma.conciergeConversation.create({ data: { model } });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.ConciergeConversation;
  }
}

async function getConversationByPublicId(
  publicId: string,
): Promise<ConciergeConversation> {
  const row = await prisma.conciergeConversation.findUnique({
    where: { conciergeConversationID: publicId },
  });
  if (!row || row.isArchived) throw NotFoundError.ConciergeConversation;
  return row;
}

async function appendTurns(
  conversationId: number,
  turns: AppendConciergeTurnInput[],
): Promise<number> {
  if (turns.length === 0) {
    return prisma.conciergeTurn.count({ where: { conversationId } });
  }
  try {
    const existing = await prisma.conciergeTurn.count({
      where: { conversationId },
    });
    await prisma.conciergeTurn.createMany({
      data: turns.map((t, i) => ({
        conversationId,
        sequence: existing + i,
        role: t.role,
        content: t.content,
      })),
    });
    return existing + turns.length;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.ConciergeConversation;
  }
}

async function getRecentTurns(
  conversationId: number,
  limit: number,
): Promise<ConciergeTurn[]> {
  try {
    const rows = await prisma.conciergeTurn.findMany({
      where: { conversationId },
      orderBy: { sequence: "desc" },
      take: limit,
    });
    return rows.reverse();
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.ConciergeConversation;
  }
}

export const ConciergeConversationServiceInternal: IConciergeConversationServiceInternal =
  {
    createConversation,
    getConversationByPublicId,
    appendTurns,
    getRecentTurns,
  };
