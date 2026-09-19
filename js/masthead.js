/* Builds the masthead title from the reader's name using a fixed
 * first-initial -> word map: "The <Name> <Word>".
 * Falls back to the neutral "The Daily Edition" when the name is empty
 * or its first character isn't a letter A-Z.
 */
window.MASTHEAD_WORDS = {
  A: "News", B: "Update", C: "Chronicle", D: "Daily", E: "Edition",
  F: "Post", G: "Edition", H: "Daily", I: "Insider", J: "Journal",
  K: "News", L: "Update", M: "Memo", N: "Notebook", O: "Observer",
  P: "Post", Q: "Post", R: "Review", S: "Scoop", T: "Times",
  U: "Update", V: "Voice", W: "Wire", X: "Edition", Y: "Daily", Z: "News"
};

window.getMastheadTitle = function (name) {
  var trimmed = (name || "").toString().trim();
  if (!trimmed) return "The Daily Edition";
  var initial = trimmed.charAt(0).toUpperCase();
  var word = window.MASTHEAD_WORDS[initial];
  if (!word) return "The Daily Edition";
  return "The " + trimmed + " " + word;
};
