// Show the date of the latest commit pushed to the repository in the footer.
// The date written in index.html stays as the fallback if GitHub cannot be
// reached (offline, or over GitHub's limit of 60 requests per hour per network).
var commitsUrl = "https://api.github.com/repos/aldrin-adira/FIT3179_Data_Visualisation_2/commits?per_page=1";

function showPublishedDate() {
    var element = document.getElementById("published-date");
    if (!element) {
        return;
    }
    fetch(commitsUrl)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("GitHub responded with " + response.status);
            }
            return response.json();
        })
        .then(function (commits) {
            var date = new Date(commits[0].commit.committer.date);
            // Full month name, for example "14 October 2026", in the reader's time zone.
            element.textContent = date.toLocaleDateString("en-AU", {
                day: "numeric", month: "long", year: "numeric"
            });
            element.setAttribute("datetime", commits[0].commit.committer.date);
        })
        .catch(function (error) {
            console.warn("Kept the fallback published date:", error);
        });
}

showPublishedDate();
