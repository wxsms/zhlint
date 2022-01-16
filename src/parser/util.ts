import { checkCharType } from './char'
import {
  CharType,
  GroupToken,
  GroupTokenType,
  GROUP_CHAR_SET,
  Mark,
  MarkSideType,
  MarkType,
  MARK_CHAR_SET,
  ParseStatus,
  SHORTHAND_CHARS,
  SHORTHAND_PAIR_SET,
  SingleToken,
  SingleTokenType
} from './types'

export const handlePunctuation = (
  i: number,
  char: string,
  type: CharType,
  status: ParseStatus
): void => {
  // end the last unfinished token
  finalizeCurrentToken(status, i)
  // check the current token type
  // - start of a mark: start an unfinished mark
  // - end of a mark: end the current unfinished mark
  // - neutral quote: start/end a group by pairing the last unfinished group
  // - left quote: start a new unfinished group
  // - right quote: end the current unfinished group
  // - other punctuation: add and end the current token
  if (MARK_CHAR_SET.left.indexOf(char) >= 0) {
    // push (save) the current unfinished mark if have
    createBracket(status, i, char)
    // generate a new token and mark it as a mark punctuation by left
    // and finish the token
    appendBracket(status, i, char, MarkSideType.LEFT)
  } else if (MARK_CHAR_SET.right.indexOf(char) >= 0) {
    if (!status.lastMark) {
      throw new Error(`Unmatched closed bracket ${char} at ${i}`)
    }
    // generate token as a punctuation
    appendBracket(status, i, char, MarkSideType.RIGHT)
    // end the last unfinished mark
    // and pop the previous one if exists
    finalizeCurrentMark(status, i, char)
  } else if (GROUP_CHAR_SET.neutral.indexOf(char) >= 0) {
    // - end the last unfinished group
    // - start a new group
    if (status.lastGroup && char === status.lastGroup.startContent) {
      finalizeCurrentGroup(status, i, char)
    } else {
      createNewGroup(status, i, char)
    }
  } else if (GROUP_CHAR_SET.left.indexOf(char) >= 0) {
    createNewGroup(status, i, char)
  } else if (GROUP_CHAR_SET.right.indexOf(char) >= 0) {
    if (!status.lastGroup) {
      throw new Error(`Unmatched closed quote ${char} at ${i}`)
    }
    finalizeCurrentGroup(status, i, char)
  } else {
    addNormalPunctuation(status, i, char, type)
  }
}

export const handleContent = (
  i: number,
  char: string,
  type: CharType,
  status: ParseStatus
): void => {
  // check if type changed and last token unfinished
  // - create new token in the current group
  // - append into current unfinished token
  if (status.lastToken) {
    if (type !== CharType.UNKNOWN && status.lastToken.type !== type) {
      finalizeCurrentToken(status, i)
      createContent(status, i, char, type)
    } else {
      appendContent(status, char)
    }
  } else {
    createContent(status, i, char, type)
  }
}

// finalize token/mark/group

/**
 * Finalize the token length and push it into the current group
 */
export const finalizeCurrentToken = (
  status: ParseStatus,
  index: number
): void => {
  if (status.lastToken) {
    status.lastToken.length = index - status.lastToken.index
    status.lastGroup && status.lastGroup.push(status.lastToken)
    status.lastToken = undefined
  }
}

export const finalizeCurrentMark = (
  status: ParseStatus,
  index: number,
  char: string
) => {
  if (!status.lastMark) {
    return
  }
  status.lastMark.endIndex = index
  status.lastMark.endContent = char
  status.lastMark.rawEndContent = char
  if (status.markStack.length > 0) {
    status.lastMark = status.markStack.pop()
  } else {
    status.lastMark = undefined
  }
}

export const finalizeCurrentGroup = (
  status: ParseStatus,
  index: number,
  char: string
) => {
  if (status.lastGroup) {
    status.lastGroup.endIndex = index
    status.lastGroup.endContent = char
    status.lastGroup.rawEndContent = char
  }
  if (status.groupStack.length > 0) {
    status.lastGroup = status.groupStack.pop()
  } else {
    status.lastGroup = undefined
  }
}

// bracket marks

export const createBracket = (
  status: ParseStatus,
  index: number,
  char: string,
  type: MarkType = MarkType.BRACKETS
) => {
  if (status.lastMark) {
    status.markStack.push(status.lastMark)
    status.lastMark = undefined
  }
  const mark: Mark = {
    type,
    startIndex: index,
    startContent: char,
    rawStartContent: char,
    endIndex: -1,
    endContent: ''
  }
  status.marks.push(mark)
  status.lastMark = mark
}

export const appendBracket = (
  status: ParseStatus,
  index: number,
  char: string,
  markSide: MarkSideType
) => {
  const token: SingleToken = {
    type: SingleTokenType.MARK_BRACKETS,
    content: char,
    raw: char,
    index,
    length: 1,
    mark: status.lastMark,
    markSide
  }
  status.lastGroup && status.lastGroup.push(token)
  status.lastToken = undefined
}

// hyper marks

export const appendHyperMark = (
  status: ParseStatus,
  index: number,
  mark: Mark,
  content: string,
  markSide: MarkSideType
) => {
  const token: SingleToken = {
    type: `mark-${mark.type}` as SingleTokenType, // TODO enum
    content: content,
    raw: content,
    index,
    length: content.length,
    mark: mark,
    markSide
  }
  status.lastGroup && status.lastGroup.push(token)
  status.lastToken = undefined
}

export const appendHyperContent = (
  status: ParseStatus,
  index: number,
  content: string
) => {
  status.lastToken = {
    type: SingleTokenType.CONTENT_HYPER,
    content: content,
    raw: content,
    index,
    length: content.length
  }
  status.lastGroup && status.lastGroup.push(status.lastToken)
  status.lastToken = undefined
}

// group

export const createNewGroup = (
  status: ParseStatus,
  index: number,
  char: string
) => {
  status.lastGroup && status.groupStack.push(status.lastGroup)
  const lastGroup = [] as unknown as GroupToken
  lastGroup.type = GroupTokenType.GROUP
  lastGroup.startContent = char
  lastGroup.rawStartContent = char
  lastGroup.startIndex = index
  status.groupStack[status.groupStack.length - 1].push(lastGroup)
  status.lastGroup = lastGroup
  status.groups.push(lastGroup)
}

// content

export const createContent = (
  status: ParseStatus,
  index: number,
  char: string,
  type: CharType
) => {
  status.lastToken = { type, content: char, raw: char, index, length: 1 }
}

export const appendContent = (status: ParseStatus, char: string) => {
  if (status.lastToken) {
    status.lastToken.content += char
    status.lastToken.raw = status.lastToken.content
    status.lastToken.length++
  }
}

// others

/**
 * Get the length of connecting spaces from a certain index
 */
export const getConnectingSpaceLength = (
  str: string,
  start: number
): number => {
  // not even a space
  if (checkCharType(str[start]) !== CharType.SPACE) {
    return 0
  }

  // find the next non-space char
  for (let i = start + 1; i < str.length; i++) {
    const char = str[i]
    const type = checkCharType(char)
    if (type !== CharType.SPACE) {
      return i - start
    }
  }

  // space till the end
  return str.length - start
}

const addNormalPunctuation = (
  status: ParseStatus,
  index: number,
  char: string,
  type: CharType
) => {
  status.lastToken = { type, content: char, raw: char, index, length: 1 }
  status.lastGroup && status.lastGroup.push(status.lastToken)
  status.lastToken = undefined
}

export const isShorthand = (
  str: string,
  status: ParseStatus,
  index: number,
  char: string
): boolean => {
  if (SHORTHAND_CHARS.indexOf(char) < 0) {
    return false
  }
  if (!status.lastToken || status.lastToken.type !== CharType.CONTENT_HALF) {
    return false
  }
  const nextChar = str[index + 1]
  const nextType = checkCharType(nextChar)
  if (nextType === CharType.CONTENT_HALF) {
    return true
  }
  if (nextType === CharType.SPACE) {
    if (!status.lastGroup) {
      return true
    }
    if (status.lastGroup.startContent !== SHORTHAND_PAIR_SET[char]) {
      return true
    }
  }
  return false
}